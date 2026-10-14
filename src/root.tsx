import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "../src/+types/root";
import stylesheet from "./global.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap",
  },
  { rel: "stylesheet", href: stylesheet },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta
          content="JavaScript, TypeScript, benchmarking, performance, browser, BenchJS, code comparison, real-time metrics"
          name="keywords"
        />
        <meta content="website" property="og:type" />
        <meta content="BenchJS - JavaScript Benchmarking" property="og:title" />
        <meta
          content="Run, compare, and share JavaScript benchmarks in your browser with BenchJS."
          property="og:description"
        />
        <meta content="https://benchjs.com" property="og:url" />
        <meta content="https://root.b-cdn.net/benchjs/Social.png" property="og:image" />
        <meta content="BenchJS" property="og:site_name" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content="BenchJS - JavaScript Benchmarking" name="twitter:title" />
        <meta
          content="Run, compare, and share JavaScript benchmarks in your browser with BenchJS."
          name="twitter:description"
        />
        <meta content="https://root.b-cdn.net/benchjs/Social.png" name="twitter:image" />
        <link href="https://benchjs.com" rel="canonical" />
        <meta content="BenchJS" name="application-name" />
        <meta content="index, follow" name="robots" />

        <Meta />
        <Links />
        <script
          data-exclude-hash="true"
          data-website-id="ea9f6c22-8c85-4263-9ac3-117f77718a0a"
          src="https://umami.dev.pet/script.js"
          defer
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container p-4 pt-16 mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="overflow-x-auto p-4 w-full">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
