'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  createFlowVersion,
  getFlow,
  getFlowVersion,
  publishFlowVersion,
  setFlowStartNode,
  upsertFlowNode,
  deleteFlowNode,
  upsertFlowOption,
  deleteFlowOption,
  validateFlowVersion
} from '@/lib/api';

const NODE_TYPES = ['text','single_choice','multi_choice','number','date','file','end'] as const;

function humanizeFlowText(msg: string): string {
  let out = String(msg || '');
  out = out.replace(/node_key/gi, 'Question ID');
  out = out.replace(/option_key/gi, 'Option');
  out = out.replace(/flow_node_id/gi, 'Question');
  out = out.replace(/\bkey\b/gi, 'Question');
  return out;
}

function formatFlowError(err: any): string {
  const raw = String(err?.response?.data?.message || err?.message || '').trim();
  if (!raw) return 'Failed. Please check your Questions and Options.';

  // Normalize wording from backend to UI-friendly text
  let msg = raw;

  // Replace technical terms
  msg = humanizeFlowText(msg);

  // Common patterns
  msg = msg.replace(/key not found/gi, 'Question not found');
  msg = msg.replace(/not found/gi, 'not found');

  return msg;
}

export default function FlowEditPage() {
  const params = useParams();
  const flowId = Number(params?.id);

  const [flow, setFlow] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const [version, setVersion] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [reloading, setReloading] = useState(false);

  const optionKeyToLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options || []) {
      const k = String(o?.option_key || '').trim();
      if (!k) continue;
      const label = String(o?.label_i18n?.en || '').trim();
      if (label) m.set(k, label);
    }
    return m;
  }, [options]);

  const questionKeyToText = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes || []) {
      const k = String(n?.node_key || '').trim();
      if (!k) continue;
      const t = String(n?.prompt_i18n?.en || '').trim();
      if (t) m.set(k, t);
    }
    return m;
  }, [nodes]);

  const appendQuestionContext = (msg: string) => {
    // If the message contains a Question ID, append its question text (if available)
    const m = msg.match(/Question ID\s*[:=]?\s*([A-Za-z0-9_\-]+)/i);
    const qid = m?.[1];
    if (!qid) return msg;
    const qt = questionKeyToText.get(qid);
    if (!qt) return msg;
    return `${msg}\nQuestion: ${qid} — ${qt}`;
  };

  const formatFlowErrorUi = (err: any) => {
    // Start from the generic formatter (Question/Option wording)
    let msg = formatFlowError(err);

    // Replace option_key values with their button text when possible
    msg = msg.replace(/\bopt_\d+\b/gi, (k) => optionKeyToLabel.get(k) || k);

    // If it's option-related, include the source question
    msg = appendQuestionContext(msg);

    return msg;
  };

  // Collapse/expand options per question
  const [collapsedOptions, setCollapsedOptions] = useState<Record<string, boolean>>({});

  const nodesById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const optionsByNodeId = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const o of options) {
      const list = m.get(o.flow_node_id) || [];
      list.push(o);
      m.set(o.flow_node_id, list);
    }
    for (const [k, list] of m.entries()) {
      list.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      m.set(k, list);
    }
    return m;
  }, [options]);

  const loadFlow = async () => {
    const data = await getFlow(flowId);
    setFlow(data.flow);
    setVersions(data.versions || []);
    const first = (data.versions || [])[0];
    if (first?.id) setSelectedVersionId(first.id);
  };

  const loadVersion = async (versionId: number) => {
    const data = await getFlowVersion(flowId, versionId);
    setVersion(data.version);
    setNodes(data.nodes || []);
    setOptions(data.options || []);
  };

  useEffect(() => {
    if (!flowId) return;
    loadFlow().catch((e) => toast.error(formatFlowError(e)));
  }, [flowId]);

  useEffect(() => {
    if (selectedVersionId) {
      loadVersion(selectedVersionId).catch((e) => toast.error(formatFlowError(e)));
    }
  }, [selectedVersionId]);

  const ensureVersion = async (): Promise<number> => {
    // Ensure there's an editable version selected.
    if (selectedVersionId) return selectedVersionId;

    const data = await createFlowVersion(flowId);
    await loadFlow();
    setSelectedVersionId(data.version.id);
    return data.version.id;
  };

  const onPublish = async () => {
    if (!selectedVersionId) return;
    try {
      const v = await validateFlowVersion(selectedVersionId);
      if (!v.ok) {
        toast.error('Fix validation errors before publishing');
        return;
      }
      await publishFlowVersion(selectedVersionId);
      toast.success('Saved');
      await loadFlow();
    } catch (e: any) {
      toast.error(formatFlowErrorUi(e));
    }
  };

  const onValidate = async () => {
    if (!selectedVersionId) return;
    const v = await validateFlowVersion(selectedVersionId);
    if (v.ok) toast.success('✅ Valid');
    else {
       const lines = (v.errors || []).map((e: string) => {
         const base = humanizeFlowText(e);
         const withOpt = base.replace(/\bopt_\d+\b/gi, (k) => optionKeyToLabel.get(k) || k);
         return appendQuestionContext(withOpt);
       });
       toast.error(lines.join('\n'));
     }
  };

  const onSetStart = async () => {
    if (!selectedVersionId) return;
    if (!version?.start_node_key) {
      toast.error('Set the First Question ID first');
      return;
    }
    try {
      await setFlowStartNode(selectedVersionId, version.start_node_key);
      toast.success('Start node set');
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      toast.error(formatFlowErrorUi(e));
    }
  };

  const onUpsertNode = async (nodeKey: string) => {
    if (!selectedVersionId) return;
    const n = nodes.find(x => x.node_key === nodeKey) || { node_key: nodeKey };
    try {
      await upsertFlowNode(selectedVersionId, nodeKey, n);
      toast.success('Question saved');
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      toast.error(formatFlowErrorUi(e));
    }
  };

  const onDeleteNode = async (nodeKey: string) => {
    if (!selectedVersionId) return;
    if (!confirm(`Delete node ${nodeKey}?`)) return;
    await deleteFlowNode(selectedVersionId, nodeKey);
    await loadVersion(selectedVersionId);
  };

  const onUpsertOption = async (nodeId: number, optionKey: string) => {
    try {
      const list = optionsByNodeId.get(nodeId) || [];
      const existing = list.find(o => o.option_key === optionKey) || { option_key: optionKey };
      await upsertFlowOption(nodeId, optionKey, existing);
      toast.success('Option saved');
      await loadVersion(selectedVersionId!);
    } catch (e: any) {
      toast.error(formatFlowErrorUi(e));
    }
  };

  const onDeleteOption = async (nodeId: number, optionKey: string) => {
    if (!confirm(`Delete option ${optionKey}?`)) return;
    await deleteFlowOption(nodeId, optionKey);
    await loadVersion(selectedVersionId!);
  };

  const onSaveFlowAll = async () => {
    try {
      setSavingAll(true);

      const versionId = await ensureVersion();

      // Save all questions first (ensures node ids exist)
      const nodesSorted = [...nodes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      for (const n of nodesSorted) {
        if (!n?.node_key) continue;
        await upsertFlowNode(versionId, n.node_key, n);
      }

      // Save first question (start node)
      if (version?.start_node_key) {
        await setFlowStartNode(versionId, version.start_node_key);
      }

      // Do NOT reload the page state here.
      // We only need the latest node ids from the server, without wiping unsaved UI edits.
      const currentNodes = await getFlowVersion(flowId, versionId);
      const nodeKeyToId = new Map((currentNodes.nodes || []).map((n: any) => [n.node_key, n.id]));

      const optionsSorted = [...options].sort((a, b) => {
        const na = (a.flow_node_id ?? 0) - (b.flow_node_id ?? 0);
        if (na !== 0) return na;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      for (const o of optionsSorted) {
        if (!o) continue;
        // If option is linked by node_key instead of flow_node_id, repair it
        if (!o.flow_node_id && o.node_key && nodeKeyToId.has(o.node_key)) {
          o.flow_node_id = nodeKeyToId.get(o.node_key);
        }
        if (!o.flow_node_id || !o.option_key) continue;
        await upsertFlowOption(o.flow_node_id, o.option_key, o);
      }

      // Validate then auto-publish
      const vres = await validateFlowVersion(versionId);
      if (!vres.ok) {
        const lines = (vres.errors || []).map((e: string) => {
          const base = humanizeFlowText(e);
          const withOpt = base.replace(/\bopt_\d+\b/gi, (k) => optionKeyToLabel.get(k) || k);
          return appendQuestionContext(withOpt);
        });
        toast.error(lines.join('\n'));
        return;
      }

      await publishFlowVersion(versionId);
      toast.success('✅ Saved');
      await loadFlow();
      await loadVersion(versionId);
    } catch (e: any) {
      toast.error(formatFlowErrorUi(e));
    } finally {
      setSavingAll(false);
    }
  };

  const onRefresh = async () => {
    if (!flowId) return;
    try {
      setReloading(true);
      await loadFlow();
      if (selectedVersionId) {
        await loadVersion(selectedVersionId);
      }
    } finally {
      setReloading(false);
    }
  };

  if (!flow) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Flow: {flow.title} ({flow.slug})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <div className="ml-auto flex gap-2 items-center">
            <button
              type="button"
              onClick={onRefresh}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-2"
              disabled={reloading || savingAll}
            >
              <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onSaveFlowAll}
              className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
              disabled={savingAll}
            >
              <Save className="h-4 w-4 text-white" />
              <span>{savingAll ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {version && (
        <Card>
          <CardHeader>
            <CardTitle>First Question</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label>First Question ID (start)</Label>
              <Input value={version.start_node_key || ''} onChange={(e) => setVersion({ ...version, start_node_key: e.target.value })} placeholder="e.g. question_1" />
            </div>
            
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedVersionId) return;

                // Auto-generate a short unique Question ID (no popup).
                // Format: question_1, question_2, ...
                const used = new Set(nodes.map((x) => String(x.node_key || '').toLowerCase()));
                let i = 1;
                while (used.has(`question_${i}`)) i += 1;
                const nk = `question_${i}`;

                // Temp key so React keys stay stable while user edits Question ID.
                const tmp =
                  typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? // @ts-ignore
                      crypto.randomUUID()
                    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

                // Insert new question at the TOP
                const bumped = nodes.map((x) => ({ ...x, sort_order: (x.sort_order ?? 0) + 1 }));
                setNodes([
                  {
                    __tempKey: tmp,
                    flow_version_id: selectedVersionId,
                    node_key: nk,
                    type: 'text',
                    prompt_i18n: { en: '' },
                    help_i18n: {},
                    required: true,
                    next_node_key: null,
                    sort_order: 0
                  },
                  ...bumped
                ]);
              }}
            >
              + Add Question
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question ID</TableHead>
                <TableHead>Question Type</TableHead>
                <TableHead>Question text (English)</TableHead>
                <TableHead>Go to Question ID (Next)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((n) => {
                const isChoice = n.type === 'single_choice' || n.type === 'multi_choice';
                const optList = n.id
                  ? (optionsByNodeId.get(n.id) || [])
                  : options.filter((o) => o.node_key === n.node_key);
                const nKey = n.id ? `id-${n.id}` : `tmp-${n.__tempKey || n.node_key}`;
                const isCollapsed = collapsedOptions[n.node_key] !== false; // default collapsed

                return (
                  <Fragment key={nKey}>
                    <TableRow>
                      <TableCell className="font-mono">
                        {!n.id ? (
                          <Input
                            value={n.node_key}
                            onChange={(e) => {
                              const nextKey = e.target.value;
                              setNodes(nodes.map((x) => (x === n ? { ...x, node_key: nextKey } : x)));
                            }}
                            placeholder="Question ID"
                          />
                        ) : (
                          n.node_key
                        )}
                      </TableCell>
                      <TableCell>
                        <Select value={n.type} onValueChange={(v) => setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, type: v } : x))}>
                          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {NODE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={n.prompt_i18n?.en || ''}
                          onChange={(e) =>
                            setNodes(
                              nodes.map((x) =>
                                x.node_key === n.node_key
                                  ? { ...x, prompt_i18n: { ...(x.prompt_i18n || {}), en: e.target.value } }
                                  : x
                              )
                            )
                          }
                          className="min-w-[260px]"
                          rows={2}
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={n.next_node_key || ''} onChange={(e) => setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, next_node_key: e.target.value || null } : x))} />
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {isChoice && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCollapsedOptions((prev) => ({
                                ...prev,
                                [n.node_key]: !(prev[n.node_key] !== false),
                              }))
                            }
                          >
                            {isCollapsed ? 'Expand' : 'Collapse'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDeleteNode(n.node_key)}
                          aria-label="Delete question"
                          className="p-2 h-8 w-8 inline-flex items-center justify-center border-red-500 text-red-500 hover:bg-red-50 cursor-pointer"
                        >
                          <svg
                            className="w-4 h-4 text-red-500"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                          </svg>
                        </Button>
                      </TableCell>
                    </TableRow>

                    {isChoice && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          {isCollapsed ? null : (
                            <div className="border rounded p-3 bg-white max-w-3xl mx-auto">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <div className="font-semibold">Options for: {n.node_key}</div>
                                  <div className="text-xs text-muted-foreground">Shown under this question. Telegram buttons will be shown in one row.</div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const existingKeys = new Set((optList || []).map((x: any) => String(x.option_key)));
                                      let i = (optList || []).length + 1;
                                      let key = `opt_${i}`;
                                      while (existingKeys.has(key)) {
                                        i += 1;
                                        key = `opt_${i}`;
                                      }

                                      setOptions([
                                        ...options,
                                        {
                                          // allow options before the question is saved:
                                          // link by node_key for now, and flow_node_id will be filled during Save Flow.
                                          flow_node_id: n.id || null,
                                          node_key: n.node_key,
                                          option_key: key,
                                          label_i18n: { en: '' },
                                          next_node_key: null,
                                          sort_order: (optList || []).length
                                        }
                                      ]);
                                    }}
                                  >
                                    + Add Option
                                  </Button>
                                </div>
                              </div>

                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Button text (English)</TableHead>
                                    <TableHead>Go to Question ID (Next)</TableHead>
                                    <TableHead className="w-[220px]"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(optList || [])
                                    .slice()
                                    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                    .map((o: any) => (
                                      <TableRow key={o.option_key}>
                                        <TableCell>
                                          <Input
                                            className="w-[220px] bg-white dark:bg-neutral-950"
                                            value={o.label_i18n?.en || ''}
                                            onChange={(e) =>
                                              setOptions(
                                                options.map((x) =>
                                                  (((n.id && x.flow_node_id === n.id) || (!n.id && x.node_key === n.node_key)) && x.option_key === o.option_key)
                                                    ? { ...x, label_i18n: { ...(x.label_i18n || {}), en: e.target.value } }
                                                    : x
                                                )
                                              )
                                            }
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            className="w-[180px] bg-white dark:bg-neutral-950"
                                            value={o.next_node_key || ''}
                                            onChange={(e) =>
                                              setOptions(
                                                options.map((x) =>
                                                  (((n.id && x.flow_node_id === n.id) || (!n.id && x.node_key === n.node_key)) && x.option_key === o.option_key)
                                                    ? { ...x, next_node_key: e.target.value || null }
                                                    : x
                                                )
                                              )
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              if (!n.id) {
                                                // Unsaved question: remove locally
                                                setOptions((prev) => prev.filter((x) => !(x.node_key === n.node_key && x.option_key === o.option_key)));
                                                return;
                                              }
                                              onDeleteOption(n.id, o.option_key);
                                            }}
                                            aria-label="Delete option"
                                            className="p-2 h-8 w-8 inline-flex items-center justify-center border-red-500 text-red-500 hover:bg-red-50 cursor-pointer"
                                          >
                                            <svg
                                              className="w-4 h-4 text-red-500"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <circle cx="12" cy="12" r="9" />
                                              <line x1="9" y1="9" x2="15" y2="15" />
                                              <line x1="15" y1="9" x2="9" y2="15" />
                                            </svg>
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
