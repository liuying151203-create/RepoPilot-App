import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test-utils";
import RepositoryIntelligenceTab, {
  shouldPollIndexStatus,
} from "./repository-intelligence-tab";

const {
  buildIndexMock,
  getContextMock,
  getStatusMock,
  refreshIndexMock,
  setEnabledMock,
  setLevelMock,
  getGraphMock,
  clearIndexMock,
} = vi.hoisted(() => ({
  buildIndexMock: vi.fn(),
  getContextMock: vi.fn(),
  getStatusMock: vi.fn(),
  refreshIndexMock: vi.fn(),
  setEnabledMock: vi.fn(),
  setLevelMock: vi.fn(),
  getGraphMock: vi.fn(),
  clearIndexMock: vi.fn(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { kind: "local" } }),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: { workspace: { working_dir: "D:/dev/example" } },
  }),
}));

vi.mock("#/api/repository-intelligence-service", () => ({
  default: {
    buildIndex: buildIndexMock,
    getContext: getContextMock,
    getStatus: getStatusMock,
    refreshIndex: refreshIndexMock,
    setEnabled: setEnabledMock,
    setLevel: setLevelMock,
    getGraph: getGraphMock,
    clearIndex: clearIndexMock,
  },
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

const disabledStatus = {
  repository_path: "D:/dev/example",
  repository_name: "example",
  enabled: false,
  state: "not_indexed" as const,
  file_count: 0,
  symbol_count: 0,
  relationship_count: 0,
  graph_ready: false,
  updated_at: null,
  providers: [],
  index_level: "repository_map" as const,
  capabilities: ["repository_map" as const],
  error: null,
};

const indexedStatus = {
  ...disabledStatus,
  enabled: true,
  state: "indexed" as const,
  file_count: 12,
  symbol_count: 48,
  relationship_count: 20,
  graph_ready: true,
};

const codeSearchStatus = {
  ...indexedStatus,
  index_level: "code_search" as const,
  capabilities: ["repository_map" as const, "code_search" as const],
  providers: [
    {
      name: "internal-search-engine",
      configured: true,
      available: true,
      detail: "ready",
      service_state: "ready" as const,
      repository_state: "not_built" as const,
      capability: "code_search" as const,
      selected: true,
      item_count: 0,
      supports_visualization: false,
    },
  ],
};

const contextGraphStatus = {
  ...indexedStatus,
  index_level: "context_graph" as const,
  capabilities: [
    "repository_map" as const,
    "code_search" as const,
    "context_graph" as const,
  ],
  providers: [
    {
      name: "internal-graph-engine",
      configured: true,
      available: true,
      detail: "ready",
      service_state: "ready" as const,
      repository_state: "indexed" as const,
      capability: "context_graph" as const,
      selected: true,
      item_count: 2,
      supports_visualization: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getStatusMock.mockResolvedValue(disabledStatus);
  setEnabledMock.mockResolvedValue({ ...disabledStatus, enabled: true });
  setLevelMock.mockResolvedValue(codeSearchStatus);
  buildIndexMock.mockResolvedValue(indexedStatus);
  getGraphMock.mockResolvedValue({
    nodes: [
      {
        id: "service:inventory",
        type: "Service",
        caption: "Inventory",
        summary: "Inventory service",
        properties: {},
      },
    ],
    edges: [],
    truncated: false,
    index_level: "context_graph",
  });
  getContextMock.mockResolvedValue({
    task: "restore inventory",
    repository_path: "D:/dev/example",
    relevant_files: ["orders.py", "inventory.py"],
    symbols: [],
    relationships: [
      {
        source: "orders.py",
        target: "inventory.py",
        relation: "imports",
        provider: "local",
      },
    ],
    tests: ["test_orders.py"],
    matches: [],
    providers_used: ["local"],
    providers_queried: ["local"],
    capabilities_used: ["repository_map"],
    capability_contributions: { repository_map: 2 },
    index_level: "repository_map",
    summary: "Repository context ready",
  });
});

describe("RepositoryIntelligenceTab", () => {
  it("polls only while the selected capability is being built", () => {
    expect(
      shouldPollIndexStatus({
        ...codeSearchStatus,
        providers: [
          {
            ...codeSearchStatus.providers[0],
            repository_state: "indexing",
          },
        ],
      }),
    ).toBe(true);
    expect(shouldPollIndexStatus(codeSearchStatus)).toBe(false);
  });

  it("persists enablement, builds the index, and renders retrieved context", async () => {
    renderWithProviders(<RepositoryIntelligenceTab />);

    const toggle = await screen.findByRole("switch");
    const build = screen.getByRole("button", {
      name: "REPOSITORY_INTELLIGENCE$BUILD_REPOSITORY_MAP",
    });
    expect(build).toBeDisabled();

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(setEnabledMock).toHaveBeenCalledWith("D:/dev/example", true),
    );
    expect(build).toBeEnabled();

    fireEvent.click(build);
    await waitFor(() =>
      expect(buildIndexMock).toHaveBeenCalledWith(
        "D:/dev/example",
        "repository_map",
      ),
    );

    const task = screen.getByPlaceholderText(
      "REPOSITORY_INTELLIGENCE$TASK_PLACEHOLDER",
    );
    fireEvent.change(task, { target: { value: "restore inventory" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "REPOSITORY_INTELLIGENCE$RETRIEVE_CONTEXT",
      }),
    );

    expect((await screen.findAllByText("inventory.py")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("test_orders.py")).toBeInTheDocument();
    expect(getContextMock).toHaveBeenCalledWith(
      "D:/dev/example",
      "restore inventory",
    );
  });

  it("switches capability levels without exposing internal engine names", async () => {
    getStatusMock.mockResolvedValue(indexedStatus);
    renderWithProviders(<RepositoryIntelligenceTab />);

    const levelButton = (
      await screen.findByText("REPOSITORY_INTELLIGENCE$LEVEL_CODE_SEARCH")
    ).closest("button")!;
    await waitFor(() => expect(levelButton).toBeEnabled());
    fireEvent.click(levelButton);

    await waitFor(() =>
      expect(setLevelMock).toHaveBeenCalledWith(
        "D:/dev/example",
        "code_search",
      ),
    );
    expect(
      screen.getByRole("button", {
        name: "REPOSITORY_INTELLIGENCE$BUILD_SEARCH_INDEX",
      }),
    ).toBeEnabled();
    expect(
      screen.queryByText("internal-search-engine"),
    ).not.toBeInTheDocument();
  });

  it("opens graph nodes with keyboard navigation", async () => {
    getStatusMock.mockResolvedValue(contextGraphStatus);
    renderWithProviders(<RepositoryIntelligenceTab />);

    const openGraph = await screen.findByRole("button", {
      name: "REPOSITORY_INTELLIGENCE$OPEN_GRAPH",
    });
    await waitFor(() => expect(openGraph).toBeEnabled());
    fireEvent.click(openGraph);

    const node = await screen.findByRole("button", { name: "Inventory" });
    fireEvent.keyDown(node, { key: "Enter" });

    expect(screen.getByText("Inventory service")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "REPOSITORY_INTELLIGENCE$EXPAND_NEIGHBORS",
      }),
    ).toBeEnabled();
  });
});
