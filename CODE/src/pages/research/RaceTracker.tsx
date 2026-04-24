import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { fetchRaceDetail, fetchRaces } from '@/lib/researcherAuth';
import type { ResearchRaceListItem } from '@/types/research';

const CYCLES = [2024, 2022, 2020, 2018];

function formatMargin(margin: number): string {
  const sign = margin > 0 ? 'D+' : margin < 0 ? 'R+' : '';
  return `${sign}${Math.abs(margin).toFixed(1)}`;
}

export default function RaceTracker() {
  const [state, setState] = useState('');
  const [officeType, setOfficeType] = useState<'' | 'HOUSE' | 'SENATE'>('');
  const [cycle, setCycle] = useState<number>(2022);
  const [selected, setSelected] = useState<ResearchRaceListItem | null>(null);

  const racesQuery = useQuery({
    queryKey: ['research', 'races', state, officeType, cycle],
    queryFn: () => fetchRaces({ state: state || undefined, officeType: officeType || undefined, cycle }),
  });

  const detailQuery = useQuery({
    queryKey: ['research', 'raceDetail', selected?.key, selected?.cycle],
    queryFn: () =>
      fetchRaceDetail(
        selected!.state,
        selected!.officeType,
        selected!.district || 'AT_LARGE',
        selected!.cycle,
      ),
    enabled: !!selected,
  });

  const sortedCounties = useMemo(() => {
    const list = detailQuery.data?.counties ?? [];
    return [...list].sort((a, b) => b.totalVotes - a.totalVotes);
  }, [detailQuery.data]);

  return (
    <Layout>
      <div className="container py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/research">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          </Link>
          <h1 className="font-heading text-2xl font-bold">Race Tracker</h1>
        </div>

        <Card className="mb-6">
          <CardContent className="grid gap-4 p-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="All states"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Office</Label>
              <Select value={officeType || 'ALL'} onValueChange={(v) => setOfficeType(v === 'ALL' ? '' : (v as 'HOUSE' | 'SENATE'))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All offices</SelectItem>
                  <SelectItem value="HOUSE">House</SelectItem>
                  <SelectItem value="SENATE">Senate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cycle</Label>
              <Select value={String(cycle)} onValueChange={(v) => setCycle(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLES.map((c) => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Races ({racesQuery.data?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-auto p-0">
              {racesQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : racesQuery.data && racesQuery.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>State</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead>District</TableHead>
                      <TableHead className="text-right">Votes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {racesQuery.data.map((r) => (
                      <TableRow
                        key={r.key}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer ${selected?.key === r.key ? 'bg-primary/5' : ''}`}
                      >
                        <TableCell className="font-medium">{r.state}</TableCell>
                        <TableCell>{r.officeType}</TableCell>
                        <TableCell>{r.district ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.totalVotes.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No races found. Try importing county results first with{' '}
                  <code className="rounded bg-muted px-1">npm run import:county-results</code>.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {selected
                  ? `${selected.state} ${selected.officeType}${selected.district ? ` CD-${selected.district}` : ''} · ${selected.cycle}`
                  : 'Select a race'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selected && <p className="text-sm text-muted-foreground">Click a race to see county-level returns.</p>}
              {selected && detailQuery.isLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading counties…
                </div>
              )}
              {detailQuery.data && (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-4 rounded-lg bg-muted/40 p-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">Total votes</div>
                      <div className="font-semibold tabular-nums">{detailQuery.data.rollup.totalVotes.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Dem share</div>
                      <div className="font-semibold tabular-nums">{detailQuery.data.rollup.demPct.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Rep share</div>
                      <div className="font-semibold tabular-nums">{detailQuery.data.rollup.repPct.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="max-h-[55vh] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>County</TableHead>
                          <TableHead className="text-right">D%</TableHead>
                          <TableHead className="text-right">R%</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="text-right">Votes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedCounties.map((c) => (
                          <TableRow key={c.fipsCode}>
                            <TableCell>{c.countyName}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.demPct.toFixed(1)}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.repPct.toFixed(1)}</TableCell>
                            <TableCell className={`text-right tabular-nums ${c.margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {formatMargin(c.margin)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{c.totalVotes.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
