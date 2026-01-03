'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { bulkUpdateSettings, createFlow, getFlows, getSettings } from '@/lib/api';

export default function FlowsPage() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [defaultFlowId, setDefaultFlowId] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const [flowsData, settingsData] = await Promise.all([getFlows(), getSettings()]);
      setFlows(flowsData.flows || []);

      const def = (settingsData.settings || []).find((s: any) => s.key === 'default_flow_id');
      setDefaultFlowId(String(def?.value || ''));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load flows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setAsDefault = async (flowId: string) => {
    try {
      await bulkUpdateSettings([{ key: 'default_flow_id', value: flowId }]);
      setDefaultFlowId(flowId);
      toast.success(`Default flow set to: ${flowId}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to set default flow');
    }
  };

  const onCreate = async () => {
    if (!slug.trim() || !title.trim()) {
      toast.error('Slug and title are required');
      return;
    }
    try {
      await createFlow({ slug: slug.trim(), title: title.trim() });
      setSlug('');
      setTitle('');
      toast.success('Flow created');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to create flow');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Conversation Flow Builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Flow ID (slug) e.g. service-flow" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <Input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Button onClick={onCreate}>Create</Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Each flow has versions. Edit a draft version and publish when ready. (Published = live for users)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flows</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Flow ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.id}</TableCell>
                    <TableCell className="font-mono">{f.slug}</TableCell>
                    <TableCell>{f.title}</TableCell>
                    <TableCell>{f.published?.version ? `v${f.published.version}` : '—'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {defaultFlowId === f.slug ? (
                        <span className="text-xs px-2 py-1 rounded bg-muted">Default</span>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setAsDefault(f.slug)}>
                          Set Default
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/flows/${f.id}`}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
