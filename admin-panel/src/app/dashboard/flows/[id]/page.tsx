'use client';

import { useEffect, useMemo, useState } from 'react';
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
                const nk = prompt('New Question ID? (unique)');
                if (!nk || !selectedVersionId) return;
                setNodes([
                  ...nodes,
                  {
                    flow_version_id: selectedVersionId,
                    node_key: nk,
                    type: 'text',
                    prompt_i18n: { en: '' },
                    help_i18n: {},
                    required: true,
                    validation: {},
                    next_node_key: null,
                    sort_order: nodes.length
                  }
                ]);
              }}
            >
              Add Question
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question ID</TableHead>
                <TableHead>Question Type</TableHead>
                <TableHead>Question text (English)</TableHead>
                <TableHead>Go to Question ID (Next)</TableHead>
                <TableHead>Save Answer As</TableHead>
                <TableHead>Rules (JSON)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((n) => (
                <TableRow key={n.node_key}>
                  <TableCell className="font-mono">{n.node_key}</TableCell>
                  {/* Question ID shown above uses internal field node_key; label is user-friendly */}
                  <TableCell>
                    <Select value={n.type} onValueChange={(v) => setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, type: v } : x))}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NODE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={n.prompt_i18n?.en || ''} onChange={(e) => setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, prompt_i18n: { ...(x.prompt_i18n||{}), en: e.target.value } } : x))} />
                  </TableCell>
                  <TableCell>
                    <Input value={n.next_node_key || ''} onChange={(e) => setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, next_node_key: e.target.value || null } : x))} />
                  </TableCell>
                  <TableCell>
                    <Input value={n.save_as || ''} onChange={(e) => setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, save_as: e.target.value || null } : x))} />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={JSON.stringify(n.validation || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const v = JSON.parse(e.target.value || '{}');
                          setNodes(nodes.map(x => x.node_key===n.node_key ? { ...x, validation: v } : x));
                        } catch {
                          // ignore invalid while typing
                        }
                      }}
                      className="min-w-[260px]"
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      onClick={() => onUpsertNode(n.node_key)}
                      className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    >
                      Save Question
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDeleteNode(n.node_key)}>
                      Delete Question
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Answer Choices (only for Single Choice / Multi Choice questions)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {nodes
            .filter((n) => n.type === 'single_choice' || n.type === 'multi_choice')
            .map((n) => {
              const node = nodesById.get(n.id);
              if (!node) return null;
              const list = optionsByNodeId.get(node.id) || [];
              return (
                <div key={node.node_key} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-semibold">Question: {node.node_key}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const ok = prompt('New choice key? (e.g. A, 1, yes)');
                        if (!ok) return;
                        setOptions([
                          ...options,
                          {
                            flow_node_id: node.id,
                            option_key: ok,
                            label_i18n: { en: ok },
                            value: ok,
                            next_node_key: null,
                            sort_order: list.length
                          }
                        ]);
                      }}
                    >
                      Add Option
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Choice Key</TableHead>
                        <TableHead>Button text (English)</TableHead>
                        <TableHead>Saved value</TableHead>
                        <TableHead>Go to Question ID (Next)</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((o) => (
                        <TableRow key={o.option_key}>
                          <TableCell className="font-mono">{o.option_key}</TableCell>
                          <TableCell>
                            <Input value={o.label_i18n?.en || ''} onChange={(e) => setOptions(options.map(x => (x.flow_node_id===node.id && x.option_key===o.option_key) ? { ...x, label_i18n: { ...(x.label_i18n||{}), en: e.target.value } } : x))} />
                          </TableCell>
                          <TableCell>
                            <Input value={o.value || ''} onChange={(e) => setOptions(options.map(x => (x.flow_node_id===node.id && x.option_key===o.option_key) ? { ...x, value: e.target.value } : x))} />
                          </TableCell>
                          <TableCell>
                            <Input value={o.next_node_key || ''} onChange={(e) => setOptions(options.map(x => (x.flow_node_id===node.id && x.option_key===o.option_key) ? { ...x, next_node_key: e.target.value || null } : x))} />
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              onClick={() => onUpsertOption(node.id, o.option_key)}
                              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                            >
                              Save Option
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => onDeleteOption(node.id, o.option_key)}>
                              Delete Option
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
