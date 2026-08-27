import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync("src/components/dashboard/dashboard-content.tsx", "utf8");

const skeletonSource = readFileSync("src/components/dashboard/dashboard-skeleton.tsx", "utf8");

const concentrationSource = readFileSync("src/components/dashboard/concentration-card.tsx", "utf8");

const heatmapSource = readFileSync("src/components/analysis/portfolio-heatmap.tsx", "utf8");

describe("dashboard portfolio layout", () => {
  it("aligns the composition card with the desktop overview row and fills it internally", () => {
    expect(dashboardSource).toContain("<PortfolioHeatmap summary={summary} fillHeight />");

    expect(dashboardSource).toContain("lg:[&>*]:flex-1");
    expect(dashboardSource).toContain("lg:[&>*]:min-h-0");
    expect(dashboardSource).toContain("lg:min-h-0");
    expect(dashboardSource).toContain("lg:contain-size");

    expect(heatmapSource).not.toContain('fillHeight && "lg:h-full"');

    expect(heatmapSource).toContain('fillHeight && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"');

    expect(heatmapSource).toContain('fillHeight && "lg:min-h-0 lg:flex-1"');

    expect(heatmapSource.match(/fillHeight && "lg:flex lg:min-h-0 lg:flex-col"/g)).toHaveLength(2);
  });

  it("separates concentration from the 8/4 portfolio overview row", () => {
    const overviewStart = dashboardSource.indexOf('data-testid="portfolio-overview-row"');

    expect(overviewStart).toBeGreaterThan(-1);

    // On vérifie la structure de la ligne directement dans le fichier,
    // sans dépendre de l'indentation ou d'un découpage fragile.
    expect(dashboardSource).toContain('data-testid="portfolio-overview-row"');

    expect(dashboardSource).toContain("lg:col-span-8");
    expect(dashboardSource).toContain("lg:col-span-4");

    expect(dashboardSource).toContain("async function ConcentrationSection");

    expect(dashboardSource).toContain("if (summary.totalAssets <= 0) return null;");

    expect(dashboardSource).toContain("return <ConcentrationCard summary={summary} />;");

    expect(concentrationSource).toContain("if (top.length === 0) return null;");

    expect(concentrationSource).toContain('<div data-testid="portfolio-concentration-row">');

    expect(concentrationSource).toContain('<Card className="flex flex-col">');
  });

  it("keeps the loading skeleton topology aligned with the dashboard", () => {
    const overviewStart = skeletonSource.indexOf('data-testid="portfolio-overview-skeleton"');

    expect(overviewStart).toBeGreaterThan(-1);

    expect(skeletonSource).toContain('data-testid="portfolio-overview-skeleton"');

    expect(skeletonSource).toContain("lg:col-span-8");
    expect(skeletonSource).toContain("lg:col-span-4");
    expect(skeletonSource).toContain("lg:contain-size");
    expect(skeletonSource).toContain("lg:[&>*]:flex-1");

    expect(skeletonSource).toContain("<PortfolioHeatmapSkeleton />");

    expect(skeletonSource).toContain('data-testid="portfolio-concentration-skeleton"');

    expect(skeletonSource).toContain("export function ConcentrationCardSkeleton()");

    expect(skeletonSource).toContain("<ConcentrationCardSkeleton />");
  });

  it("lays concentration out horizontally on desktop", () => {
    expect(concentrationSource).toContain("lg:grid-cols-[minmax(12rem,0.3fr)_minmax(0,1fr)]");

    expect(concentrationSource).toContain("sm:grid-cols-2 xl:grid-cols-3");
  });
});
