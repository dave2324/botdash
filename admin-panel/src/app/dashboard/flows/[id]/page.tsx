'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
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
    loadFlow().catch((e) => toast.error(e?.message || 'Failed to load flow'));
  }, [flowId]);

  useEffect(() => {
    if (selectedVersionId) {
      loadVersion(selectedVersionId).catch((e) => toast.error(e?.message || 'Failed to load version'));
    }
  }, [selectedVersionId]);

  const onCreateVersion = async () => {
    try {
      const data = await createFlowVersion(flowId);
      toast.success('Draft version created');
      await loadFlow();
      setSelectedVersionId(data.version.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to create version');
    }
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
      toast.success('Published');
      await loadFlow();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to publish');
    }
  };

  const onValidate = async () => {
    if (!selectedVersionId) return;
    const v = await validateFlowVersion(selectedVersionId);
    if (v.ok) toast.success('✅ Valid');
    else toast.error(v.errors.join('\n'));
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
      toast.error(e?.response?.data?.message || e?.message || 'Failed');
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
      toast.error(e?.response?.data?.message || e?.message || 'Failed');
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
      toast.error(e?.response?.data?.message || e?.message || 'Failed');
    }
  };

  const onDeleteOption = async (nodeId: number, optionKey: string) => {
    if (!confirm(`Delete option ${optionKey}?`)) return;
    await deleteFlowOption(nodeId, optionKey);
    await loadVersion(selectedVersionId!);
  };

  const onSaveFlowAll = async () => {
    if (!selectedVersionId) return;

    try {
      setSavingAll(true);

      // Save all questions first (ensures node ids exist)
      const nodesSorted = [...nodes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      for (const n of nodesSorted) {
        if (!n?.node_key) continue;
        await upsertFlowNode(selectedVersionId, n.node_key, n);
      }

      // Save start node key (version settings)
      if (version?.start_node_key) {
        await setFlowStartNode(selectedVersionId, version.start_node_key);
      }

      // Reload so we have the latest ids
      await loadVersion(selectedVersionId);

      // Save all options (for saved nodes)
      const currentNodes = await getFlowVersion(flowId, selectedVersionId);
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

      toast.success('✅ Flow saved');
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to save flow');
    } finally {
      setSavingAll(false);
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
          <Button variant="outline" onClick={onCreateVersion}>New Draft Version</Button>
          <Button variant="outline" onClick={onValidate}>Validate</Button>
          <Button
            onClick={onPublish}
            className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Publish
          </Button>

          <div className="ml-auto flex gap-2 items-center">
            <Button
              onClick={onSaveFlowAll}
              disabled={!selectedVersionId || savingAll}
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {savingAll ? 'Saving...' : 'Save Flow'}
            </Button>
            <Select value={selectedVersionId ? String(selectedVersionId) : ''} onValueChange={(v) => setSelectedVersionId(Number(v))}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    v{v.version} ({v.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {version && (
        <Card>
          <CardHeader>
            <CardTitle>Version Settings (Draft / Published)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label>First Question ID (start)</Label>
              <Input value={version.start_node_key || ''} onChange={(e) => setVersion({ ...version, start_node_key: e.target.value })} placeholder="e.g. Start" />
            </div>
            <div>
              <Label>Status</Label>
              <Input value={version.status} disabled />
            </div>
            <Button
              variant="outline"
              onClick={onSetStart}
              className="border-blue-500 text-blue-600 hover:bg-blue-600/10 dark:text-blue-300 dark:border-blue-400"
            >
              Save first question
            </Button>
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

                // Auto-generate a unique Question ID (no popup).
                const suffix = Math.random().toString(36).slice(2, 8);
                const nk = `q_${Date.now()}_${suffix}`;

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
                const optList = n.id ? (optionsByNodeId.get(n.id) || []) : [];
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
                            {isCollapsed ? 'Show options' : 'Hide options'}
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => onDeleteNode(n.node_key)}>
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>

                    {isChoice && !isCollapsed && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          {!n.id ? (
                            <div className="text-sm text-muted-foreground">
                              Save this question first to enable options.
                            </div>
                          ) : (
                            <div className="border rounded p-3 bg-background">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-semibold">Options for: {n.node_key}</div>
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
                                        flow_node_id: n.id,
                                        option_key: key,
                                        label_i18n: { en: '' },
                                        next_node_key: null,
                                        sort_order: (optList || []).length
                                      }
                                    ]);
                                  }}
                                >
                                  + Add Row
                                </Button>
                              </div>

                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-16">Order</TableHead>
                                    <TableHead>Choice Key</TableHead>
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
                                      <TableCell className="text-center text-xs text-muted-foreground">{(o.sort_order ?? 0) + 1}</TableCell>
                                      <TableCell className="font-mono">{o.option_key}</TableCell>
                                      <TableCell>
                                        <Input value={o.label_i18n?.en || ''} onChange={(e) => setOptions(options.map(x => (x.flow_node_id===n.id && x.option_key===o.option_key) ? { ...x, label_i18n: { ...(x.label_i18n||{}), en: e.target.value } } : x))} />
                                      </TableCell>
                                      <TableCell>
                                        <Input value={o.next_node_key || ''} onChange={(e) => setOptions(options.map(x => (x.flow_node_id===n.id && x.option_key===o.option_key) ? { ...x, next_node_key: e.target.value || null } : x))} />
                                      </TableCell>
                                      <TableCell className="text-right space-x-2">
                                        <Button size="sm" variant="destructive" onClick={() => onDeleteOption(n.id, o.option_key)}>
                                          Delete
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>

                              <div className="mt-2 text-xs text-muted-foreground">
                                Note: Telegram buttons will be shown in one row.
                              </div>
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
