import { SiGithub } from "@icons-pack/react-simple-icons";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Code2,
  Gauge,
  PackagePlus,
  Play,
  Share2,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/common/Logo";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import type { Route } from "../../src/routes/+types/home";

export const meta: Route.MetaFunction = () => [
  { title: "BenchJS - JavaScript Benchmarking" },
  {
    name: "description",
    content:
      "Write and run JavaScript or TypeScript benchmarks in the browser. Compare implementations and share the results.",
  },
];

const PILLARS = [
  {
    number: "01",
    title: "Create a benchmark",
    description:
      "Write setup code and each implementation in JavaScript or TypeScript.",
  },
  {
    number: "02",
    title: "Run it in the browser",
    description:
      "Benchmate runs each implementation with the same setup and records samples, throughput, and elapsed time.",
  },
  {
    number: "03",
    title: "Compare or share",
    description:
      "Compare the results. Share the benchmark URL or export the comparison as an image.",
  },
];

const BENCHMARK_RESULTS = [
  { name: "for loop", value: "8.24M", width: "100%", winner: true },
  { name: "for...of", value: "6.91M", width: "84%", winner: false },
  { name: "reduce", value: "4.72M", width: "57%", winner: false },
];

const HomePage = () => {
  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground selection:bg-brand selection:text-zinc-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
          <Link aria-label="BenchJS home" to="/">
            <Logo />
          </Link>

          <div className="flex items-center gap-1">
            <nav
              aria-label="Main navigation"
              className="flex items-center gap-1"
            >
              <a
                className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
                href="https://github.com/3rd/benchjs"
                rel="noopener noreferrer"
                target="_blank"
              >
                <SiGithub className="size-4" />
                GitHub
              </a>
              <Button
                asChild
                className="ml-1 rounded-full px-4 dark:bg-brand dark:text-zinc-950 dark:hover:bg-yellow-400"
                size="default"
              >
                <Link to="/playground">
                  Open playground
                  <ArrowRight />
                </Link>
              </Button>
            </nav>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-5 pb-16 pt-32 sm:px-8 sm:pb-20 sm:pt-40">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(128,128,128,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.08)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_86%)]"
          />

          <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(620px,1.12fr)] lg:gap-12">
            <div className="max-w-2xl">
              <h1 className="max-w-3xl text-balance text-5xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                JavaScript benchmarks in your browser.
              </h1>

              <p className="mt-8 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
                Write JavaScript or TypeScript benchmarks, compare
                implementations, and share a link. No account or install
                required.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="h-12 rounded-full px-6 text-base shadow-lg shadow-foreground/10 dark:bg-brand dark:text-zinc-950 dark:hover:bg-yellow-400"
                >
                  <Link to="/playground">
                    <Play className="fill-current" />
                    Open playground
                  </Link>
                </Button>
                <Button
                  asChild
                  className="h-12 rounded-full px-6 text-base"
                  variant="outline"
                >
                  <a
                    href="https://github.com/3rd/benchjs"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <SiGithub />
                    GitHub
                  </a>
                </Button>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[760px] lg:mx-0">
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-950 shadow-[0_28px_70px_-36px_rgba(0,0,0,0.4)] ring-1 ring-zinc-950/5 [color-scheme:light]">
                <div className="flex h-11 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4">
                  <div className="flex items-center gap-1 text-xs font-bold text-zinc-900">
                    <Zap className="size-3.5 text-yellow-500" />
                    <span>
                      Bench<span className="bg-yellow-400 px-0.5">JS</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                    Array sum
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700">
                    <Share2 className="size-3" />
                    Share
                  </div>
                </div>

                <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(245px,0.85fr)]">
                  <div className="min-w-0 border-zinc-200 md:border-r">
                    <div className="grid min-h-[360px] sm:grid-cols-[38px_128px_minmax(0,1fr)]">
                      <div className="hidden flex-col items-center gap-2 border-r border-zinc-200 bg-white py-3 sm:flex">
                        <div className="flex size-7 items-center justify-center rounded-md bg-zinc-900 text-white">
                          <Code2 className="size-4" />
                        </div>
                        <div className="flex size-7 items-center justify-center text-zinc-500">
                          <BarChart3 className="size-4" />
                        </div>
                        <div className="flex size-7 items-center justify-center text-zinc-500">
                          <Gauge className="size-4" />
                        </div>
                      </div>
                      <aside className="hidden border-r border-zinc-200 bg-zinc-50 px-3 py-4 text-[11px] text-zinc-500 sm:block">
                        <p className="mb-3 font-semibold uppercase tracking-[0.16em] text-zinc-600">
                          Code
                        </p>
                        <div className="space-y-1.5 font-mono">
                          <p className="text-zinc-600">setup.ts</p>
                          <p className="flex items-center gap-1.5 rounded bg-yellow-100 px-1.5 py-1 text-zinc-900">
                            <span className="size-1 rounded-full bg-yellow-500" />
                            for-loop.ts
                          </p>
                          <p className="pl-1.5">for-of.ts</p>
                          <p className="pl-1.5">reduce.ts</p>
                        </div>
                      </aside>

                      <div className="min-w-0">
                        <div className="flex h-10 items-end border-b border-zinc-200 px-3 font-mono text-[11px]">
                          <div className="border-b-2 border-yellow-500 px-3 pb-2 text-zinc-900">
                            for-loop.ts
                          </div>
                          <div className="px-3 pb-2 text-zinc-600">
                            setup.ts
                          </div>
                        </div>
                        <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-7 text-zinc-700 sm:text-[13px]">
                          <code>
                            <span className="text-fuchsia-700">
                              export const
                            </span>{" "}
                            <span className="text-blue-700">run</span> = () =
                            {">"} {"{"}
                            {"\n"} <span className="text-fuchsia-700">let</span>{" "}
                            total =<span className="text-amber-700"> 0</span>;
                            {"\n\n"}{" "}
                            <span className="text-fuchsia-700">for</span> (
                            <span className="text-fuchsia-700">let</span> i =
                            <span className="text-amber-700"> 0</span>; i {"<"}{" "}
                            values.length; i++) {"{"}
                            {"\n"} total += values[i];
                            {"\n"} {"}"}
                            {"\n\n"}{" "}
                            <span className="text-fuchsia-700">return</span>{" "}
                            total;
                            {"\n"}
                            {"}"};
                          </code>
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-50 p-5 sm:p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Latest run
                        </p>
                        <p className="mt-1 text-lg font-semibold text-zinc-950">
                          Array sum
                        </p>
                      </div>
                      <div className="flex size-9 items-center justify-center rounded-full bg-yellow-400 text-zinc-950 shadow-lg shadow-yellow-400/20">
                        <Play className="size-4 fill-current" />
                      </div>
                    </div>

                    <div className="mt-8 space-y-5">
                      {BENCHMARK_RESULTS.map((result) => (
                        <div key={result.name}>
                          <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                            <span
                              className={
                                result.winner
                                  ? "font-semibold text-zinc-900"
                                  : "text-zinc-500"
                              }
                            >
                              {result.name}
                            </span>
                            <span className="font-mono text-zinc-700">
                              {result.value} ops/s
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className={
                                result.winner
                                  ? "h-full rounded-full bg-yellow-400"
                                  : "h-full rounded-full bg-zinc-400"
                              }
                              style={{ width: result.width }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-5">
                      <div className="rounded-lg border border-zinc-200 bg-white p-3">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          Samples
                        </p>
                        <p className="mt-1 font-mono text-sm text-zinc-900">
                          1,248
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-200 bg-white p-3">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          Margin
                        </p>
                        <p className="mt-1 font-mono text-sm text-emerald-700">
                          ±0.82%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-[10px] text-zinc-500">
                  <span>TypeScript 5.x</span>
                  <span className="font-mono">completed in 2.4s</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight">Workflow</h2>
            </div>

            <div className="grid gap-8 border-t border-border pt-8 md:grid-cols-3 md:gap-10">
              {PILLARS.map(({ description, number, title }) => (
                <article key={title}>
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {number}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-3 max-w-sm leading-7 text-muted-foreground">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight">Playground</h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-12">
              <article className="rounded-3xl border border-border bg-muted/55 p-7 sm:p-10 lg:col-span-7 lg:min-h-[460px]">
                <div className="max-w-md">
                  <div className="mb-6 flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                    <BarChart3 className="size-5" />
                  </div>
                  <h3 className="text-3xl font-bold tracking-tight">Results</h3>
                  <p className="mt-4 leading-7 text-muted-foreground">
                    See elapsed time, throughput, sample count, and margin of
                    error for each implementation.
                  </p>
                </div>

                <div className="mt-12 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <Timer className="mb-5 size-5 text-amber-600 dark:text-yellow-400" />
                    <p className="text-xs text-muted-foreground">
                      Elapsed time
                    </p>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      2.41s
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <Gauge className="mb-5 size-5 text-amber-600 dark:text-yellow-400" />
                    <p className="text-xs text-muted-foreground">Throughput</p>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      8.24M
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <Sparkles className="mb-5 size-5 text-amber-600 dark:text-yellow-400" />
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      ±0.82%
                    </p>
                  </div>
                </div>
              </article>

              <article className="relative overflow-hidden rounded-3xl border border-border bg-muted/55 p-7 sm:p-9 lg:col-span-5">
                <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                  <PackagePlus className="size-5" />
                </div>
                <h3 className="mt-8 text-2xl font-bold tracking-tight">
                  ESM dependencies
                </h3>
                <p className="mt-4 leading-7 text-muted-foreground">
                  Add packages through esm.sh, then import them in setup or
                  implementation files.
                </p>
                <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs text-muted-foreground">
                    <span>Dependencies</span>
                    <span>esm.sh</span>
                  </div>
                  {["lodash-es", "date-fns", "es-toolkit"].map(
                    (dependency, index) => (
                      <div
                        className={`flex items-center justify-between px-4 py-3 font-mono text-xs ${index > 0 ? "border-t border-border" : ""}`}
                        key={dependency}
                      >
                        <span>{dependency}</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          ready
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-border bg-muted/55 p-7 sm:p-9 lg:col-span-5">
                <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                  <Zap className="size-5" />
                </div>
                <h3 className="mt-8 text-2xl font-bold tracking-tight">
                  Browser workspace
                </h3>
                <p className="mt-4 leading-7 text-muted-foreground">
                  Benchmarks run in the browser without an account or local
                  install.
                </p>
              </article>

              <article className="rounded-3xl border border-border bg-muted/55 p-7 sm:p-9 lg:col-span-7">
                <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                  <Share2 className="size-5" />
                </div>
                <h3 className="mt-8 max-w-lg text-2xl font-bold tracking-tight">
                  Share and export
                </h3>
                <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                  Copy a link to the benchmark, or copy or download the
                  comparison as an image.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 pt-4 sm:px-8 sm:pb-20 sm:pt-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex max-w-2xl items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                <SiGithub className="size-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Open source</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Source code and issue tracker are public on GitHub.
                </p>
              </div>
            </div>
            <Button
              asChild
              className="w-fit rounded-full px-5"
              variant="outline"
            >
              <a
                href="https://github.com/3rd/benchjs"
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub
                <ArrowUpRight />
              </a>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
