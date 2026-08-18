import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClientOptionsMock } = vi.hoisted(() => ({
  getClientOptionsMock: vi.fn(),
}));

vi.mock("./agent-server-client-options", () => ({
  getAgentServerClientOptions: getClientOptionsMock,
}));

import RepositoryIntelligenceService from "./repository-intelligence-service";

describe("RepositoryIntelligenceService", () => {
  beforeEach(() => {
    getClientOptionsMock.mockReturnValue({
      host: "http://127.0.0.1:8000",
      apiKey: "session-key",
      workingDir: "workspace/project",
    });
    vi.restoreAllMocks();
  });

  it("loads status for an encoded repository path with session auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          repository_path: "D:/dev/example repo",
          repository_name: "example repo",
          enabled: false,
          state: "not_indexed",
          file_count: 0,
          symbol_count: 0,
          relationship_count: 0,
          graph_ready: false,
          updated_at: null,
          providers: [],
          error: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const status = await RepositoryIntelligenceService.getStatus(
      "D:/dev/example repo",
    );

    expect(status.repository_name).toBe("example repo");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/repository-intelligence/status?repository_path=D%3A%2Fdev%2Fexample+repo",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Session-API-Key": "session-key",
        }),
      }),
    );
  });

  it("persists the enabled state through the agent server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ enabled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await RepositoryIntelligenceService.setEnabled("workspace/project", true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/repository-intelligence/enabled",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          repository_path: "workspace/project",
          enabled: true,
        }),
      }),
    );
  });

  it("manages the code search credential without reading its value", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code_search_configured: true,
            code_search_source: "secure_store",
            secure_storage_available: true,
            secure_storage_detail: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const saved =
      await RepositoryIntelligenceService.setCodeSearchCredential("secret");
    await RepositoryIntelligenceService.clearCodeSearchCredential();

    expect(saved).not.toHaveProperty("api_key");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/repository-intelligence/credentials/code-search",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ api_key: "secret" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/repository-intelligence/credentials/code-search",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("persists the selected intelligence level and builds that level", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ index_level: "code_search" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await RepositoryIntelligenceService.setLevel(
      "workspace/project",
      "code_search",
    );
    await RepositoryIntelligenceService.buildIndex(
      "workspace/project",
      "code_search",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/repository-intelligence/level",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          repository_path: "workspace/project",
          index_level: "code_search",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/repository-intelligence/indexes",
      expect.objectContaining({
        body: JSON.stringify({
          repository_path: "workspace/project",
          index_level: "code_search",
        }),
      }),
    );
  });

  it("starts and controls a persistent index task", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "task/1", state: "queued" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await RepositoryIntelligenceService.startIndexTask(
      "workspace/project",
      "context_graph",
    );
    await RepositoryIntelligenceService.getLatestIndexTask("workspace/project");
    await RepositoryIntelligenceService.retryIndexTask("task/1");
    await RepositoryIntelligenceService.cancelIndexTask("task/1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/repository-intelligence/index-tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          repository_path: "workspace/project",
          index_level: "context_graph",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/repository-intelligence/index-tasks/latest?repository_path=workspace%2Fproject",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:8000/api/repository-intelligence/index-tasks/task%2F1/retry",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:8000/api/repository-intelligence/index-tasks/task%2F1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces agent-server error details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Repository index is not built" }),
        {
          status: 422,
          statusText: "Unprocessable Entity",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      RepositoryIntelligenceService.getContext(
        "workspace/project",
        "fix inventory",
      ),
    ).rejects.toThrow("Repository index is not built");
  });
});
