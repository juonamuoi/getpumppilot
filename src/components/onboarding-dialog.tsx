import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useOnboarding, RISK_PROFILES, type RiskProfile } from "@/lib/onboarding-store";
import { usePaper } from "@/lib/paper-store";
import { toast } from "sonner";
import { Sparkles, ShieldCheck, GraduationCap } from "lucide-react";

const GOAL_OPTIONS = [
  "Learn how crypto trading works",
  "Practice a strategy risk-free",
  "Spot momentum trades faster",
  "Build discipline with risk controls",
];

export function OnboardingDialog() {
  const { state, complete } = useOnboarding();
  const { risk, setRisk } = usePaper();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.name);
  const [profile, setProfile] = useState<RiskProfile>(state.riskProfile);
  const [goals, setGoals] = useState<string[]>(state.goals);

  useEffect(() => {
    if (!state.completed) setOpen(true);
  }, [state.completed]);

  function next() {
    setStep((s) => s + 1);
  }
  function finish() {
    const p = RISK_PROFILES[profile];
    setRisk({
      ...risk,
      maxPositionPct: p.maxPositionPct,
      stopLossPct: p.stopLossPct,
      takeProfitPct: p.takeProfitPct,
    });
    complete({ name: name.trim(), riskProfile: profile, goals });
    setOpen(false);
    toast.success(`Welcome${name.trim() ? `, ${name.trim()}` : ""}! Your ${p.label} profile is set.`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" /> Welcome to PumpPilot AI
          </div>
          <DialogTitle className="text-xl">
            {step === 0 && "Let's set you up in 30 seconds"}
            {step === 1 && "Pick your risk profile"}
            {step === 2 && "What do you want to get out of this?"}
          </DialogTitle>
          <DialogDescription>
            {step === 0 && "Everything here is paper trading with demo data. Zero real money is at risk."}
            {step === 1 && "We'll pre-set position limits, stop-loss and take-profit for you. You can change them anytime."}
            {step === 2 && "Optional — we'll tailor the copilot's suggestions to your goals."}
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Your name (optional)</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
              />
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100/90">
              <div className="flex items-center gap-2 font-semibold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Safe by design
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>Live execution is <strong>locked</strong>. You can't lose real money.</li>
                <li>We never ask for seed phrases or private keys.</li>
                <li>All prices, tokens marked DEMO, and scores are simulated.</li>
              </ul>
            </div>
          </div>
        )}

        {step === 1 && (
          <RadioGroup value={profile} onValueChange={(v) => setProfile(v as RiskProfile)} className="space-y-2">
            {(Object.keys(RISK_PROFILES) as RiskProfile[]).map((k) => {
              const p = RISK_PROFILES[k];
              return (
                <label
                  key={k}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    profile === k ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/60 hover:bg-muted/30"
                  }`}
                >
                  <RadioGroupItem value={k} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{p.label}</div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Max {p.maxPositionPct}% · SL {p.stopLossPct}% · TP {p.takeProfitPct}%
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.blurb}</p>
                  </div>
                </label>
              );
            })}
          </RadioGroup>
        )}

        {step === 2 && (
          <div className="space-y-2">
            {GOAL_OPTIONS.map((g) => (
              <label key={g} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30">
                <Checkbox
                  checked={goals.includes(g)}
                  onCheckedChange={(v) =>
                    setGoals((prev) => (v ? [...prev, g] : prev.filter((x) => x !== g)))
                  }
                />
                <span className="text-sm">{g}</span>
              </label>
            ))}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-emerald-400" />
              Tip: press <kbd className="mx-1 rounded border border-border bg-background px-1 font-mono">⌘K</kbd>
              (or Ctrl+K) anytime to jump anywhere fast.
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => complete({ name, riskProfile: profile, goals })}>
            Skip
          </Button>
          {step < 2 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={finish}>Start trading (paper)</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
