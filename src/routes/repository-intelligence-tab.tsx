import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, GitBranch, SearchCode } from "lucide-react";
import { useTranslation } from "react-i18next";

import RepositoryIntelligenceService, {
  type RepositoryContext,
  type RepositoryIndexStatus,
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
  return (
    <section className="space-y-4 rounded-lg border border-[var(--oh-border)] p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">
          {t(I18nKey.REPOSITORY_INTELLIGENCE$RETRIEVED_CONTEXT)}
        </h3>
        <p className="mt-1 text-xs text-[var(--oh-muted)]">{context.summary}</p>
      </div>
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
          <div className="space-y-1 text-sm text-white">
            {context.tests.map((path) => (
              <div key={path} className="font-mono">
                {path}
              </div>
            ))}
          </div>
        </div>
      )}
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
  const repositoryPath = conversation?.workspace?.working_dir?.trim() ?? "";
  const isLocal = backend.kind === "local";
  const statusKey = ["repository-intelligence", repositoryPath];

  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => RepositoryIntelligenceService.getStatus(repositoryPath),
    enabled: isLocal && Boolean(repositoryPath),
    retry: false,
    staleTime: 10_000,
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

  const index = useMutation({
    mutationFn: (refresh: boolean) =>
      refresh
        ? RepositoryIntelligenceService.refreshIndex(repositoryPath)
        : RepositoryIntelligenceService.buildIndex(repositoryPath),
    onSuccess: (next) => {
      updateStatus(next);
      displaySuccessToast(t(I18nKey.REPOSITORY_INTELLIGENCE$INDEX_COMPLETE));
    },
    onError: (error) => displayErrorToast(error.message),
  });

  const retrieve = useMutation({
    mutationFn: () =>
      RepositoryIntelligenceService.getContext(repositoryPath, task.trim()),
    onSuccess: setContext,
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
  const isIndexed = current?.state === "indexed";
  const busy = toggle.isPending || index.isPending;
  const stateLabel = (() => {
    switch (current?.state) {
      case "indexed":
        return t(I18nKey.REPOSITORY_INTELLIGENCE$INDEXED);
      case "building":
        return t(I18nKey.REPOSITORY_INTELLIGENCE$BUILDING);
      case "error":
        return t(I18nKey.ERROR$GENERIC);
      default:
        return t(I18nKey.REPOSITORY_INTELLIGENCE$NOT_INDEXED);
    }
  })();

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
          onToggle={() => {
            if (!busy) toggle.mutate(!enabled);
          }}
          className={cn(busy && "pointer-events-none opacity-50")}
        />
      </header>

      {status.error && (
        <p role="alert" className="text-sm text-red-300">
          {status.error.message}
        </p>
      )}

      <section className="rounded-lg border border-[var(--oh-border)] p-4">
        <div className="text-xs text-[var(--oh-muted)]">
          {t(I18nKey.CONVERSATION$REPOSITORY)}
        </div>
        <div className="mt-1 break-all font-mono text-sm text-white">
          {current?.repository_name ?? repositoryPath}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MetricCard label={t(I18nKey.COMMON$STATUS)} value={stateLabel} />
          <MetricCard
            label={t(I18nKey.COMMON$FILES)}
            value={current?.file_count ?? 0}
          />
          <MetricCard
            label={t(I18nKey.REPOSITORY_INTELLIGENCE$SYMBOLS)}
            value={current?.symbol_count ?? 0}
          />
          <MetricCard
            label={t(I18nKey.REPOSITORY_INTELLIGENCE$GRAPH)}
            value={
              current?.graph_ready
                ? t(I18nKey.REPOSITORY_INTELLIGENCE$READY)
                : t(I18nKey.REPOSITORY_INTELLIGENCE$UNAVAILABLE)
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!enabled || busy}
            onClick={() => index.mutate(false)}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(I18nKey.REPOSITORY_INTELLIGENCE$BUILD_INDEX)}
          </button>
          <button
            type="button"
            disabled={!enabled || !isIndexed || busy}
            onClick={() => index.mutate(true)}
            className="rounded-md border border-[var(--oh-border)] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(I18nKey.REPOSITORY_INTELLIGENCE$REFRESH_INDEX)}
          </button>
        </div>
        {current?.providers && current.providers.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {current.providers.map((provider) => (
              <span
                key={provider.name}
                title={provider.detail ?? undefined}
                className={cn(
                  "rounded-full border px-2 py-1 text-xs",
                  provider.available
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-[var(--oh-border)] text-[var(--oh-muted)]",
                )}
              >
                {provider.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <label
          className="block text-sm font-medium text-white"
          htmlFor="repository-context-task"
        >
          {t(I18nKey.REPOSITORY_INTELLIGENCE$RETRIEVED_CONTEXT)}
        </label>
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
    </main>
  );
}

export default RepositoryIntelligenceTab;
