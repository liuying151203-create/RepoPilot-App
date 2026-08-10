import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test-utils";
import RepositoryIntelligenceTab from "./repository-intelligence-tab";

const {
  buildIndexMock,
  getContextMock,
  getStatusMock,
  refreshIndexMock,
  setEnabledMock,
} = vi.hoisted(() => ({
  buildIndexMock: vi.fn(),
  getContextMock: vi.fn(),
  getStatusMock: vi.fn(),
  refreshIndexMock: vi.fn(),
  setEnabledMock: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  getStatusMock.mockResolvedValue(disabledStatus);
  setEnabledMock.mockResolvedValue({ ...disabledStatus, enabled: true });
  buildIndexMock.mockResolvedValue(indexedStatus);
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
    summary: "Repository context ready",
  });
});

describe("RepositoryIntelligenceTab", () => {
  it("persists enablement, builds the index, and renders retrieved context", async () => {
    renderWithProviders(<RepositoryIntelligenceTab />);

    const toggle = await screen.findByRole("switch");
    const build = screen.getByRole("button", {
      name: "REPOSITORY_INTELLIGENCE$BUILD_INDEX",
    });
    expect(build).toBeDisabled();

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(setEnabledMock).toHaveBeenCalledWith("D:/dev/example", true),
    );
    expect(build).toBeEnabled();

    fireEvent.click(build);
    await waitFor(() =>
      expect(buildIndexMock).toHaveBeenCalledWith("D:/dev/example"),
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
});
