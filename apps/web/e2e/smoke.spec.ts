import { expect, test } from "@playwright/test";

test("start page renders hero, news and navigation", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Testklubben" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Testnyhet 4" })).toBeVisible();
  if (isMobile) {
    await page.locator(".nav-mobile summary").click();
    await expect(page.locator(".nav-mobile-list").getByRole("link", { name: "Kalender" })).toBeVisible();
  } else {
    await expect(page.locator(".nav-desktop").getByRole("link", { name: "Kalender" })).toBeVisible();
  }
});

test("calendar month view has the month picker", async ({ page }) => {
  await page.goto("/kalender/");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  await expect(page.locator("select[data-cal-month]")).toBeVisible();
});

test("post page and breadcrumbs", async ({ page }) => {
  await page.goto("/testnyhet-2/");
  await expect(page.getByRole("heading", { level: 1, name: "Testnyhet 2" })).toBeVisible();
  await expect(page.getByText("Brödtext 2.")).toBeVisible();
});

test("child page has breadcrumbs", async ({ page }) => {
  await page.goto("/om-oss/historik/");
  await expect(page.locator(".breadcrumbs").getByRole("link", { name: "Om oss" })).toBeVisible();
});

test("unknown page shows not found", async ({ page }) => {
  await page.goto("/finns-inte/");
  await expect(page.getByRole("heading", { name: "Sidan hittades inte" })).toBeVisible();
});

test("SEO endpoints respond", async ({ request }) => {
  for (const path of ["/feed/", "/sitemap.xml", "/llms.txt", "/md/index.md", "/robots.txt"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
  }
});

test("admin shows the login form", async ({ page }) => {
  await page.goto("/admin/");
  await expect(page.getByRole("button", { name: "Skicka inloggningslänk" })).toBeVisible();
});
