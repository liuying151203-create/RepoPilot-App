import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  GitBranch,
  KeyRound,
  Network,
  SearchCode,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import RepositoryIntelligenceService, {
  type IntelligenceGraph,
  type IntelligenceGraphNode,
  type IntelligenceLevel,
  type RepositoryContext,
  type RepositoryIndexStatus,
  type RepositoryIndexTask,
} from "#/api/repository-intelligence-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { I18nKey } from "#/i18n/declaration";
import { ToggleSwitch } from "#/ui/toggle-switch";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

const LEVELS: {
  value: IntelligenceLevel;
  title: I18nKey;
  description: I18nKey;
  buildLabel: I18nKey;
}[] = [
  {
    value: "repository_map",
    title: I18nKey.REPOSITORY_INTELLIGENCE$LEVEL_REPOSITORY_MAP,
    description:
      I18nKey.REPOSITORY_INTELLIGENCE$LEVEL_REPOSITORY_MAP_DESCRIPTION,
    buildLabel: I18nKey.REPOSITORY_INTELLIGENCE$BUILD_REPOSITORY_MAP,
  },
  {
    value: "code_search",
    title: I18nKey.REPOSITORY_INTELLIGENCE$LEVEL_CODE_SEARCH,
    description: I18nKey.REPOSITORY_INTELLIGENCE$LEVEL_CODE_SEARCH_DESCRIPTION,
    buildLabel: I18nKey.REPOSITORY_INTELLIGENCE$BUILD_SEARCH_INDEX,
  },
  {
    value: "context_graph",
    title: I18nKey.REPOSITORY_INTELLIGENCE$LEVEL_CONTEXT_GRAPH,
    description:
      I18nKey.REPOSITORY_INTELLIGENCE$LEVEL_CONTEXT_GRAPH_DESCRIPTION,
    buildLabel: I18nKey.REPOSITORY_INTELLIGENCE$BUILD_INTELLIGENCE_INDEX,
  },
];

export const shouldPollIndexStatus = (status?: RepositoryIndexStatus) =>
  status?.providers.some(
    (provider) =>
      provider.selected &&
      (provider.repository_state === "preparing" ||
        provider.repository_state === "indexing"),
  ) ?? false;

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-3">
      <div className="text-xs text-[var(--oh-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ContextSection({ context }: { context: RepositoryContext }) {
  const { t } = useTranslation("openhands");
  const showMatches = context.index_level !== "repository_map";
  return (
    <section className="space-y-4 rounded-lg border border-[var(--oh-border)] p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">
          {t(I18nKey.REPOSITORY_INTELLIGENCE$TASK_CONTEXT_PREVIEW)}
        </h3>
        <p className="mt-1 text-xs text-[var(--oh-muted)]">{context.summary}</p>
      </div>

      {showMatches && context.matches.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
            {t(I18nKey.REPOSITORY_INTELLIGENCE$CODE_MATCHES)}
          </h4>
          <div className="space-y-2">
            {context.matches.map((match) => (
              <article
                key={`${match.path}-${match.line}-${match.symbol}`}
                className="rounded-lg border border-[var(--oh-border)] bg-black/20 p-3"
              >
                <div className="flex justify-between gap-3 font-mono text-xs text-white">
                  <span className="truncate">{match.path}</span>
                  {match.line && (
                    <span className="text-[var(--oh-muted)]">
                      :{match.line}
                    </span>
                  )}
                </div>
                {match.symbol && (
                  <div className="mt-1 text-xs text-emerald-300">
                    {match.symbol}
                  </div>
                )}
                {match.snippet && (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-[var(--oh-muted)]">
                    {match.snippet}
                  </pre>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
          {t(I18nKey.REPOSITORY_INTELLIGENCE$RELEVANT_FILES)}
        </h4>
        <div className="space-y-1 text-sm text-white">
          {context.relevant_files.map((path) => (
            <div key={path} className="rounded bg-black/20 px-2 py-1 font-mono">
              {path}
            </div>
          ))}
        </div>
      </div>

      {context.relationships.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
            {t(I18nKey.REPOSITORY_INTELLIGENCE$DEPENDENCIES)}
          </h4>
          <div className="space-y-2 text-xs text-white">
            {context.relationships.map((edge) => (
              <div
                key={`${edge.source}-${edge.relation}-${edge.target}`}
                className="flex items-center gap-2 rounded bg-black/20 px-2 py-1.5"
              >
                <span className="truncate">{edge.source}</span>
                <GitBranch className="size-3 shrink-0 text-[var(--oh-muted)]" />
                <span className="text-[var(--oh-muted)]">{edge.relation}</span>
                <span className="truncate">{edge.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {context.tests.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
            {t(I18nKey.REPOSITORY_INTELLIGENCE$TESTS)}
          </h4>
          <div className="space-y-1 font-mono text-sm text-white">
            {context.tests.map((path) => (
              <div key={path}>{path}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function GraphWorkspace({
  graph,
  onExpand,
}: {
  graph: IntelligenceGraph;
  onExpand: (node: IntelligenceGraphNode) => void;
}) {
  const { t } = useTranslation("openhands");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<IntelligenceGraphNode | null>(null);
  const positions = useMemo(() => {
    const radius = 130;
    return new Map(
      graph.nodes.map((node, index) => {
        const angle = (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
        return [
          node.id,
          {
            x: 200 + Math.cos(angle) * radius,
            y: 170 + Math.sin(angle) * radius,
          },
        ];
      }),
    );
  }, [graph.nodes]);

  return (
    <section className="rounded-lg border border-[var(--oh-border)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Network className="size-4" />
          {t(I18nKey.REPOSITORY_INTELLIGENCE$GRAPH_WORKSPACE)}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t(I18nKey.REPOSITORY_INTELLIGENCE$ZOOM_OUT)}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.2))}
            className="rounded border border-[var(--oh-border)] p-1 text-white"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t(I18nKey.REPOSITORY_INTELLIGENCE$ZOOM_IN)}
            onClick={() => setZoom((value) => Math.min(2, value + 0.2))}
            className="rounded border border-[var(--oh-border)] p-1 text-white"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="overflow-hidden rounded bg-black/20">
          <svg viewBox="0 0 400 340" className="h-[340px] w-full" role="img">
            <g
              transform={`translate(${200 - 200 * zoom} ${170 - 170 * zoom}) scale(${zoom})`}
            >
              {graph.edges.map((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="currentColor"
                    className="text-white/20"
                  />
                );
              })}
              {graph.nodes.map((node) => {
                const position = positions.get(node.id);
                if (!position) return null;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${position.x} ${position.y})`}
                    onClick={() => setSelected(node)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(node);
                      }
                    }}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={node.caption}
                  >
                    <circle
                      r="18"
                      className="fill-emerald-500/80 stroke-white/50"
                    />
                    <text
                      y="32"
                      textAnchor="middle"
                      className="fill-white text-[10px]"
                    >
                      {node.caption.slice(0, 24)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <aside className="rounded bg-black/20 p-3 text-xs text-[var(--oh-muted)]">
          {selected ? (
            <div className="space-y-2">
              <div className="font-semibold text-white">{selected.caption}</div>
              <div>{selected.type}</div>
              {selected.summary && <p>{selected.summary}</p>}
              <button
                type="button"
                onClick={() => onExpand(selected)}
                className="rounded border border-[var(--oh-border)] px-2 py-1 text-white"
              >
                {t(I18nKey.REPOSITORY_INTELLIGENCE$EXPAND_NEIGHBORS)}
              </button>
            </div>
          ) : (
            t(I18nKey.REPOSITORY_INTELLIGENCE$SELECT_GRAPH_NODE)
          )}
        </aside>
      </div>
    </section>
  );
}

function RepositoryIntelligenceTab() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { data: conversation } = useActiveConversation();
  const queryClient = useQueryClient();
  const [task, setTask] = useState("");
  const [context, setContext] = useState<RepositoryContext | null>(null);
  const [graph, setGraph] = useState<IntelligenceGraph | null>(null);
  const [codeSearchApiKey, setCodeSearchApiKey] = useState("");
  const repositoryPath = conversation?.workspace?.working_dir?.trim() ?? "";
  const isLocal = backend.kind === "local";
  const statusKey = ["repository-intelligence", repositoryPath];
  const taskKey = ["repository-intelligence", "index-task", repositoryPath];
  const notifiedTaskId = useRef<string | null>(null);
  const observedActiveTaskId = useRef<string | null>(null);

  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => RepositoryIntelligenceService.getStatus(repositoryPath),
    enabled: isLocal && Boolean(repositoryPath),
    retry: false,
    staleTime: 10_000,
    refetchInterval: (query) =>
      shouldPollIndexStatus(query.state.data) ? 2_000 : false,
    meta: { disableToast: true },
  });

  const credentialsKey = ["repository-intelligence", "credentials"];
  const credentials = useQuery({
    queryKey: credentialsKey,
    queryFn: () => RepositoryIntelligenceService.getCredentials(),
    enabled: isLocal,
    retry: false,
    staleTime: 30_000,
    meta: { disableToast: true },
  });

  const indexTask = useQuery({
    queryKey: taskKey,
    queryFn: () =>
      RepositoryIntelligenceService.getLatestIndexTask(repositoryPath),
    enabled: isLocal && Boolean(repositoryPath),
    retry: false,
    refetchInterval: (query) => {
      const value = query.state.data;
      return value && ["queued", "running", "cancelling"].includes(value.state)
        ? 1_000
        : false;
    },
    meta: { disableToast: true },
  });

  const updateStatus = (next: RepositoryIndexStatus) => {
    queryClient.setQueryData(statusKey, next);
  };

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      RepositoryIntelligenceService.setEnabled(repositoryPath, enabled),
    onSuccess: updateStatus,
    onError: (error) => displayErrorToast(error.message),
  });

  const level = useMutation({
    mutationFn: (value: IntelligenceLevel) =>
      RepositoryIntelligenceService.setLevel(repositoryPath, value),
    onSuccess: (next) => {
      updateStatus(next);
      setContext(null);
      if (next.index_level !== "context_graph") setGraph(null);
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const index = useMutation({
    mutationFn: ({ value }: { refresh: boolean; value: IntelligenceLevel }) =>
      RepositoryIntelligenceService.startIndexTask(repositoryPath, value),
    onSuccess: (next) => {
      observedActiveTaskId.current = next.id;
      queryClient.setQueryData(taskKey, next);
      notifiedTaskId.current = null;
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const retryIndex = useMutation({
    mutationFn: (value: RepositoryIndexTask) =>
      RepositoryIntelligenceService.retryIndexTask(value.id),
    onSuccess: (next) => {
      observedActiveTaskId.current = next.id;
      queryClient.setQueryData(taskKey, next);
      notifiedTaskId.current = null;
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const cancelIndex = useMutation({
    mutationFn: (value: RepositoryIndexTask) =>
      RepositoryIntelligenceService.cancelIndexTask(value.id),
    onSuccess: (next) => queryClient.setQueryData(taskKey, next),
    onError: (error) => displayErrorToast(error.message),
  });

  useEffect(() => {
    const completed = indexTask.data;
    if (
      completed &&
      ["queued", "running", "cancelling"].includes(completed.state)
    ) {
      observedActiveTaskId.current = completed.id;
      return;
    }
    if (
      completed?.state !== "succeeded" ||
      !completed.result ||
      observedActiveTaskId.current !== completed.id ||
      notifiedTaskId.current === completed.id
    ) {
      return;
    }
    queryClient.setQueryData(statusKey, completed.result);
    notifiedTaskId.current = completed.id;
    displaySuccessToast(t(I18nKey.REPOSITORY_INTELLIGENCE$INDEX_COMPLETE));
  }, [indexTask.data, queryClient, statusKey, t]);

  const clear = useMutation({
    mutationFn: () => RepositoryIntelligenceService.clearIndex(repositoryPath),
    onSuccess: (next) => {
      updateStatus(next);
      setContext(null);
      setGraph(null);
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const saveCredential = useMutation({
    mutationFn: () =>
      RepositoryIntelligenceService.setCodeSearchCredential(
        codeSearchApiKey.trim(),
      ),
    onSuccess: async (next) => {
      queryClient.setQueryData(credentialsKey, next);
      setCodeSearchApiKey("");
      await queryClient.invalidateQueries({ queryKey: statusKey });
      displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const clearCredential = useMutation({
    mutationFn: () => RepositoryIntelligenceService.clearCodeSearchCredential(),
    onSuccess: async (next) => {
      queryClient.setQueryData(credentialsKey, next);
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const retrieve = useMutation({
    mutationFn: () =>
      RepositoryIntelligenceService.getContext(repositoryPath, task.trim()),
    onSuccess: setContext,
    onError: (error) => displayErrorToast(error.message),
  });

  const loadGraph = useMutation({
    mutationFn: (nodeId?: string) =>
      RepositoryIntelligenceService.getGraph(repositoryPath, nodeId),
    onSuccess: (next) => {
      setGraph((current) => {
        if (!current) return next;
        const nodes = new Map(current.nodes.map((node) => [node.id, node]));
        next.nodes.forEach((node) => nodes.set(node.id, node));
        const edges = new Map(current.edges.map((edge) => [edge.id, edge]));
        next.edges.forEach((edge) => edges.set(edge.id, edge));
        return {
          ...next,
          nodes: [...nodes.values()],
          edges: [...edges.values()],
        };
      });
    },
    onError: (error) => displayErrorToast(error.message),
  });

  if (!isLocal || !repositoryPath) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--oh-muted)]">
        {t(I18nKey.REPOSITORY_INTELLIGENCE$LOCAL_WORKSPACE_REQUIRED)}
      </div>
    );
  }

  const current = status.data;
  const enabled = current?.enabled ?? false;
  const selectedLevel = current?.index_level ?? "repository_map";
  const isIndexed = current?.state === "indexed";
  const selectedProvider = current?.providers.find(
    (provider) => provider.capability === selectedLevel,
  );
  const selectedReady = selectedProvider?.service_state === "ready";
  const selectedBuilt = selectedProvider?.repository_state === "indexed";
  const requiresCredential = selectedProvider?.requires_credential === true;
  const currentTask = indexTask.data;
  const taskActive =
    currentTask !== null &&
    currentTask !== undefined &&
    ["queued", "running", "cancelling"].includes(currentTask.state);
  const busy =
    toggle.isPending ||
    level.isPending ||
    index.isPending ||
    clear.isPending ||
    taskActive;
  const selectedDefinition = LEVELS.find(
    (item) => item.value === selectedLevel,
  )!;

  return (
    <main className="h-full space-y-5 overflow-y-auto p-4 custom-scrollbar-always">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-white" />
            <h2 className="font-semibold text-white">
              {t(I18nKey.REPOSITORY_INTELLIGENCE$TITLE)}
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">
            {t(I18nKey.REPOSITORY_INTELLIGENCE$DESCRIPTION)}
          </p>
        </div>
        <ToggleSwitch
          enabled={enabled}
          label={t(I18nKey.REPOSITORY_INTELLIGENCE$TITLE)}
          onToggle={() => !busy && toggle.mutate(!enabled)}
          className={cn(busy && "pointer-events-none opacity-50")}
        />
      </header>

      {status.error && (
        <p role="alert" className="text-sm text-red-300">
          {status.error.message}
        </p>
      )}

      <section className="grid gap-2 md:grid-cols-3">
        {LEVELS.map((item) => {
          const provider = current?.providers.find(
            (candidate) => candidate.capability === item.value,
          );
          const selected = selectedLevel === item.value;
          return (
            <button
              key={item.value}
              type="button"
              disabled={!enabled || busy}
              onClick={() => level.mutate(item.value)}
              className={cn(
                "rounded-lg border p-3 text-left disabled:opacity-40",
                selected
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-[var(--oh-border)] bg-black/10",
              )}
            >
              <div className="text-sm font-semibold text-white">
                {t(item.title)}
              </div>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">
                {t(item.description)}
              </p>
              <div className="mt-3 text-xs text-[var(--oh-muted)]">
                {provider?.repository_state === "indexed"
                  ? t(I18nKey.REPOSITORY_INTELLIGENCE$INDEXED)
                  : provider?.repository_state === "preparing" ||
                      provider?.repository_state === "indexing"
                    ? t(I18nKey.REPOSITORY_INTELLIGENCE$BUILDING)
                    : provider?.service_state === "ready"
                      ? t(I18nKey.REPOSITORY_INTELLIGENCE$READY)
                      : t(I18nKey.REPOSITORY_INTELLIGENCE$UNAVAILABLE)}
              </div>
            </button>
          );
        })}
      </section>

      <section className="rounded-lg border border-[var(--oh-border)] p-4">
        <div className="break-all font-mono text-sm text-white">
          {current?.repository_name ?? repositoryPath}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MetricCard
            label={t(I18nKey.COMMON$FILES)}
            value={current?.file_count ?? 0}
          />
          <MetricCard
            label={t(I18nKey.REPOSITORY_INTELLIGENCE$SYMBOLS)}
            value={current?.symbol_count ?? 0}
          />
        </div>
        {((!selectedReady && selectedLevel !== "repository_map") ||
          (selectedLevel === "context_graph" &&
            selectedBuilt &&
            !selectedProvider?.supports_visualization)) && (
          <p className="mt-3 text-xs text-amber-300">
            {t(I18nKey.REPOSITORY_INTELLIGENCE$CAPABILITY_UNAVAILABLE)}
          </p>
        )}
        {requiresCredential && (
          <div
            data-testid="code-search-credential-form"
            className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <KeyRound className="size-4" />
              {t(I18nKey.SETTINGS$SEARCH_API_KEY)}
            </div>
            {selectedProvider.detail && (
              <p className="mt-1 text-xs text-amber-200">
                {selectedProvider.detail}
              </p>
            )}
            {!credentials.data?.secure_storage_available &&
              credentials.data?.secure_storage_detail && (
                <p className="mt-1 text-xs text-red-300">
                  {credentials.data.secure_storage_detail}
                </p>
              )}
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="password"
                value={codeSearchApiKey}
                onChange={(event) => setCodeSearchApiKey(event.target.value)}
                aria-label={t(I18nKey.SETTINGS$SEARCH_API_KEY)}
                placeholder={t(I18nKey.SETTINGS$API_KEY_PLACEHOLDER)}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-[var(--oh-border)] bg-black/20 px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                disabled={
                  !codeSearchApiKey.trim() ||
                  saveCredential.isPending ||
                  !credentials.data?.secure_storage_available
                }
                onClick={() => saveCredential.mutate()}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-40"
              >
                {t(I18nKey.SETTINGS$SAVE)}
              </button>
              {credentials.data?.code_search_source === "secure_store" && (
                <button
                  type="button"
                  disabled={clearCredential.isPending}
                  onClick={() => clearCredential.mutate()}
                  className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:opacity-40"
                >
                  {t(I18nKey.COMMON$REMOVE)}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              !enabled ||
              busy ||
              requiresCredential ||
              (!selectedReady && selectedLevel !== "repository_map")
            }
            onClick={() =>
              index.mutate({ refresh: false, value: selectedLevel })
            }
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(selectedDefinition.buildLabel)}
          </button>
          <button
            type="button"
            disabled={!enabled || !isIndexed || busy}
            onClick={() =>
              index.mutate({ refresh: true, value: selectedLevel })
            }
            className="rounded-md border border-[var(--oh-border)] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(I18nKey.REPOSITORY_INTELLIGENCE$REFRESH_INDEX)}
          </button>
          <button
            type="button"
            disabled={!isIndexed || busy}
            onClick={() => clear.mutate()}
            className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(I18nKey.REPOSITORY_INTELLIGENCE$CLEAR_INDEX)}
          </button>
          {selectedLevel === "context_graph" && selectedBuilt && (
            <button
              type="button"
              disabled={
                loadGraph.isPending || !selectedProvider?.supports_visualization
              }
              onClick={() => loadGraph.mutate(undefined)}
              className="rounded-md border border-[var(--oh-border)] px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              {t(I18nKey.REPOSITORY_INTELLIGENCE$OPEN_GRAPH)}
            </button>
          )}
        </div>
        {currentTask && (
          <div
            data-testid="index-task-progress"
            className="mt-4 rounded-lg border border-[var(--oh-border)] bg-black/10 p-3"
          >
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--oh-muted)]">
              <span>
                {currentTask.stage ?? currentTask.index_level} ·{" "}
                {currentTask.state}
              </span>
              <span>{currentTask.progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-emerald-400 transition-[width]"
                style={{ width: `${currentTask.progress}%` }}
              />
            </div>
            {currentTask.error && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {currentTask.error}
              </p>
            )}
            {currentTask.logs.length > 0 && (
              <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto font-mono text-[11px] text-[var(--oh-muted)]">
                {currentTask.logs.slice(-5).map((log) => (
                  <li key={`${log.timestamp}-${log.progress}-${log.message}`}>
                    [{log.progress}%] {log.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              {taskActive && (
                <button
                  type="button"
                  disabled={cancelIndex.isPending}
                  onClick={() => cancelIndex.mutate(currentTask)}
                  className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:opacity-40"
                >
                  {t(I18nKey.BUTTON$CANCEL)}
                </button>
              )}
              {["failed", "cancelled"].includes(currentTask.state) &&
                currentTask.attempt < currentTask.max_attempts && (
                  <button
                    type="button"
                    disabled={retryIndex.isPending}
                    onClick={() => retryIndex.mutate(currentTask)}
                    className="rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-xs text-white disabled:opacity-40"
                  >
                    {t(I18nKey.LAUNCH$TRY_AGAIN)}
                  </button>
                )}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <label
          className="block text-sm font-medium text-white"
          htmlFor="repository-context-task"
        >
          {t(I18nKey.REPOSITORY_INTELLIGENCE$TASK_CONTEXT_PREVIEW)}
        </label>
        <p className="text-xs text-[var(--oh-muted)]">
          {t(I18nKey.REPOSITORY_INTELLIGENCE$TASK_PREVIEW_HELP)}
        </p>
        <textarea
          id="repository-context-task"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder={t(I18nKey.REPOSITORY_INTELLIGENCE$TASK_PLACEHOLDER)}
          rows={3}
          className="w-full resize-y rounded-lg border border-[var(--oh-border)] bg-black/20 p-3 text-sm text-white outline-none focus:border-white/50"
        />
        <button
          type="button"
          disabled={
            !enabled || !isIndexed || !task.trim() || retrieve.isPending
          }
          onClick={() => retrieve.mutate()}
          className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SearchCode className="size-4" />
          {t(I18nKey.REPOSITORY_INTELLIGENCE$RETRIEVE_CONTEXT)}
        </button>
      </section>

      {context && <ContextSection context={context} />}
      {graph && (
        <GraphWorkspace
          graph={graph}
          onExpand={(node) => loadGraph.mutate(node.id)}
        />
      )}
    </main>
  );
}

export default RepositoryIntelligenceTab;
