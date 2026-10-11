import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { Button } from "@/components/ui/button";

const RELATED_SITES = [
  {
    name: "TSDiagram",
    description: "Diagrams as code with TypeScript",
    href: "https://tsdiagram.com",
  },
  {
    name: "SneakyDomains",
    description: "Find amazing domain names",
    href: "https://sneakydomains.com",
  },
  {
    name: "ColorSwapper",
    description: "Swap colors in your screenshots",
    href: "https://colorswapper.com",
  },
] as const;

export interface HeaderProps {
  className?: string;
  customNav?: React.ReactNode;
  postLogoElement?: React.ReactNode;
}

export const Header = ({ postLogoElement, customNav, className }: HeaderProps) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={cn(
        `fixed top-0 left-0 right-0 z-50 transition-all duration-200`,
        isScrolled ? "bg-background/80 backdrop-blur-md border-b border-border" : "",
        className,
      )}
    >
      <header className="flex justify-between items-center py-1 px-2 border-b border-border">
        {/* logo */}
        <div className="flex gap-2 items-center">
          <div className="relative group">
            <Link
              className="flex gap-1.5 items-center px-1.5 h-8 rounded-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
              to="/"
            >
              <Logo noIcon />
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </Link>

            <div className="invisible absolute left-0 top-full z-50 pt-1.5 w-64 opacity-0 transition-[opacity,transform,visibility] duration-150 ease-out -translate-y-[3px] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-has-[:focus-visible]:visible group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100">
              <div className="flex flex-col gap-0.5 p-1 rounded-lg border shadow-md bg-popover text-popover-foreground">
                {RELATED_SITES.map((site) => (
                  <a
                    key={site.name}
                    className="py-1.5 px-2 rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                    href={site.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <div className="flex gap-1.5 items-center">
                      <span className="text-sm font-medium">{site.name}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{site.description}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
          {postLogoElement}
        </div>

        {/* navigation */}
        <nav className="flex gap-1.5 items-center">
          <ThemeSwitcher />
          {customNav}
          {!customNav && (
            <>
              <Link to="/playground">
                <Button type="button" variant="link">
                  Playground
                </Button>
              </Link>
              <Link target="_blank" to="https://github.com/3rd/benchjs">
                <Button type="button" variant="link">
                  GitHub
                </Button>
              </Link>
            </>
          )}
        </nav>
      </header>
    </div>
  );
};
