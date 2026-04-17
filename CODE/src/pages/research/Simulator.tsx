import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
import { ChevronLeft, Loader2, Sliders as SlidersIcon } from 'lucide-react';
import { runSimulation } from '@/lib/researcherAuth';
import type { SimulationResponse } from '@/types/research';

const CYCLES = [2024, 2022, 2020, 2018];

function formatMargin(margin: number): string {
  const sign = margin > 0 ? 'D+' : margin < 0 ? 'R+' : '';
  return `${sign}${Math.abs(margin).toFixed(1)}`;
}

export default function Simulator() {
  const [baselineCycle, setBaselineCycle] = useState<number>(2022);
  const [state, setState] = useState('');
  const [officeType, setOfficeType] = useState<'' | 'HOUSE' | 'SENATE'>('');
  const [demSwing, setDemSwing] = useState(0);
  const [repSwing, setRepSwing] = useState(0);

  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(
    () => ({
      baselineCycle,
      state: state || undefined,
      officeType: officeType || undefined,
      swings: { statewide: { D: demSwing, R: repSwing } },
    }),
    [baselineCycle, state, officeType, demSwing, repSwing],
  );

  // Debounce: fire simulation 300ms after last param change
  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await runSimulation(request);
        setResult(res);
      } catch (err: any) {
        setError(err?.message ?? 'Simulation failed');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [request]);

  const flippedRaces = useMemo(() => result?.races.filter(r => r.flipped) ?? [], [result]);
  const closeRaces = useMemo(
    () => (result?.races ?? []).slice(0, 20),
    [result],
  );

  return (
    <Layout>
      <div className="container py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/research">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          </Link>
          <h1 className="font-heading text-2xl font-bold">Swing Simulator</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersIcon className="h-4 w-4" /> Scenario
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Baseline cycle</Label>
                <Select value={String(baselineCycle)} onValueChange={(v) => setBaselineCycle(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="state">State (optional)</Label>
                  <Input
                    id="state"
                    placeholder="All"
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
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="HOUSE">House</SelectItem>
                      <SelectItem value="SENATE">Senate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Democrat swing</Label>
                  <span className="text-sm tabular-nums text-blue-600">
                    {demSwing > 0 ? '+' : ''}{demSwing.toFixed(1)}pp
                  </span>
                </div>
                <Slider
                  min={-15}
                  max={15}
                  step={0.5}
                  value={[demSwing]}
                  onValueChange={(v) => setDemSwing(v[0] ?? 0)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Republican swing</Label>
                  <span className="text-sm tabular-nums text-red-600">
                    {repSwing > 0 ? '+' : ''}{repSwing.toFixed(1)}pp
                  </span>
                </div>
                <Slider
                  min={-15}
                  max={15}
                  step={0.5}
                  value={[repSwing]}
                  onValueChange={(v) => setRepSwing(v[0] ?? 0)}
                />
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={() => { setDemSwing(0); setRepSwing(0); }}>
                Reset swings
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Outcome summary</CardTitle>
              </CardHeader>
              <CardContent>
                {loading && !result && (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running simulation…
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                {result && (
                  <div className="grid gap-4 md:grid-cols-4">
                    <Stat label="Races" value={result.summary.totalRaces.toLocaleString()} />
                    <Stat label="Baseline D / R" value={`${result.summary.baselineD} / ${result.summary.baselineR}`} />
                    <Stat
                      label="Simulated D / R"
                      value={`${result.summary.simulatedD} / ${result.summary.simulatedR}`}
                      accent={loading ? 'opacity-50' : ''}
                    />
                    <Stat
                      label="Flipped (D ← / R →)"
                      value={`${result.flippedSeats.D} / ${result.flippedSeats.R}`}
                      accent="text-primary"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Flipped seats ({flippedRaces.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {flippedRaces.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No flips at current swing.</div>
                ) : (
                  <RaceTable races={flippedRaces} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tightest 20 races</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <RaceTable races={closeRaces} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value, accent = '' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-heading text-xl font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function RaceTable({ races }: { races: SimulationResponse['races'] }) {
  const formatMarginText = (margin: number) => formatMargin(margin);
  return (
    <div className="max-h-[40vh] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>State</TableHead>
            <TableHead>Office</TableHead>
            <TableHead>District</TableHead>
            <TableHead className="text-right">Baseline</TableHead>
            <TableHead className="text-right">Simulated</TableHead>
            <TableHead>Winner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {races.map((r) => (
            <TableRow key={r.key} className={r.flipped ? 'bg-primary/5' : ''}>
              <TableCell className="font-medium">{r.state}</TableCell>
              <TableCell>{r.officeType}</TableCell>
              <TableCell>{r.district ?? '—'}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.baselineMargin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatMarginText(r.baselineMargin)}
              </TableCell>
              <TableCell className={`text-right tabular-nums ${r.simulatedMargin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatMarginText(r.simulatedMargin)}
              </TableCell>
              <TableCell>
                <span className={r.simulatedWinner === 'D' ? 'text-blue-600' : r.simulatedWinner === 'R' ? 'text-red-600' : 'text-muted-foreground'}>
                  {r.simulatedWinner ?? '—'}
                </span>
                {r.flipped && <span className="ml-2 text-xs text-primary">FLIP</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
