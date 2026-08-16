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
