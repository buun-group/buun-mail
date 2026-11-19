import { describe, it, expect } from "vitest";
import { extractVerification } from "../lib/verification";

function input(overrides: Partial<{
  bodyText: string | null;
  bodyHtml: string | null;
  subject: string | null;
  fromAddress: string;
}> = {}) {
  return {
    bodyText: overrides.bodyText ?? null,
    bodyHtml: overrides.bodyHtml ?? null,
    subject: overrides.subject ?? null,
    fromAddress: overrides.fromAddress ?? "sender@example.com",
  };
}

describe("extractVerification - labelled numeric codes", () => {
  it("captures the code following 'verification code is'", () => {
    const matches = extractVerification(
      input({ bodyText: "Your verification code is 847293. Don't share it." }),
    );
    expect(matches[0]).toMatchObject({ type: "code", value: "847293" });
    expect(matches[0]?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("captures 'Your verification code: 123456'", () => {
    const matches = extractVerification(
      input({ bodyText: "Your verification code: 123456" }),
    );
    expect(matches[0]?.value).toBe("123456");
  });

  it("ranks subject-line code matches as the strongest signal (confidence 1.0)", () => {
    const matches = extractVerification(
      input({
        subject: "Your verification code is 999999",
      }),
    );
    expect(matches[0]?.value).toBe("999999");
    expect(matches[0]?.confidence).toBe(1.0);
  });
});

describe("extractVerification - alphanumeric and prefixed codes", () => {
  it("captures alphanumeric codes like A3K-9X2", () => {
    const matches = extractVerification(
      input({ bodyText: "Your verification code is A3K-9X2." }),
    );
    expect(matches.find((m) => m.value === "A3K-9X2")).toBeTruthy();
  });

  it("captures prefixed codes like G-847293", () => {
    const matches = extractVerification(
      input({ bodyText: "Your Google code: G-847293\n\nNot you?" }),
    );
    expect(matches.find((m) => m.value === "G-847293")).toBeTruthy();
  });
});

describe("extractVerification - HTML-styled codes", () => {
  it("captures bold codes from HTML", () => {
    const matches = extractVerification(
      input({ bodyHtml: "<p>Use this code: <strong>847293</strong> to sign in.</p>" }),
    );
    expect(matches.find((m) => m.value === "847293")).toBeTruthy();
  });

  it("captures large-font codes from styled spans", () => {
    const matches = extractVerification(
      input({ bodyHtml: "<span style=\"font-size:32px; letter-spacing:8px\">847293</span>" }),
    );
    expect(matches.find((m) => m.value === "847293")).toBeTruthy();
  });
});

describe("extractVerification - formatted digits", () => {
  it("captures spaced digits and collapses whitespace", () => {
    const matches = extractVerification(
      input({ bodyText: "Code: 8 4 7 2 9 3 - expires soon." }),
    );
    expect(matches.find((m) => m.value === "847293")).toBeTruthy();
  });

  it("captures dashed digits like 847-293", () => {
    const matches = extractVerification(
      input({ bodyText: "Use this code 847-293 to verify." }),
    );
    expect(matches.find((m) => m.value === "847-293")).toBeTruthy();
  });

  it("captures standalone codes on their own line", () => {
    const matches = extractVerification(
      input({ bodyText: "Hello,\n\n847293\n\nThanks!" }),
    );
    expect(matches.find((m) => m.value === "847293")).toBeTruthy();
  });
});

describe("extractVerification - links", () => {
  it("captures verification links from <a href>", () => {
    const matches = extractVerification(
      input({
        bodyHtml:
          '<a href="https://acme.com/verify?token=abc">Verify your email</a>',
      }),
    );
    const link = matches.find((m) => m.type === "link");
    expect(link?.value).toBe("https://acme.com/verify?token=abc");
    expect(link?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("ignores unsubscribe links", () => {
    const matches = extractVerification(
      input({
        bodyHtml:
          '<a href="https://acme.com/unsubscribe">Unsubscribe</a>',
      }),
    );
    expect(matches.find((m) => m.type === "link")).toBeUndefined();
  });

  it("captures URLs with token query params even without link text", () => {
    const matches = extractVerification(
      input({ bodyHtml: '<a href="https://acme.com/x?token=zzz">Click</a>' }),
    );
    expect(matches.find((m) => m.value === "https://acme.com/x?token=zzz")).toBeTruthy();
  });
});

describe("extractVerification - confidence boosts", () => {
  it("applies a sender boost for known verification senders", () => {
    const fromKnown = extractVerification(
      input({
        bodyText: "Your verification code is 847293",
        fromAddress: "noreply@acme.com",
      }),
    );
    const fromUnknown = extractVerification(
      input({
        bodyText: "Your verification code is 847293",
        fromAddress: "marketing@acme.com",
      }),
    );
    expect(fromKnown[0]?.confidence ?? 0).toBeGreaterThan(fromUnknown[0]?.confidence ?? 0);
  });

  it("caps confidence at 1.0", () => {
    const matches = extractVerification(
      input({
        subject: "Your verification code is 847293",
        fromAddress: "noreply@acme.com",
      }),
    );
    expect(matches.every((m) => m.confidence <= 1.0)).toBe(true);
  });
});

describe("extractVerification - empty and edge inputs", () => {
  it("returns empty for completely empty input", () => {
    expect(extractVerification(input())).toEqual([]);
  });

  it("deduplicates identical codes across regex passes", () => {
    const matches = extractVerification(
      input({
        bodyText: "Your verification code is 847293",
        bodyHtml: "<strong>847293</strong>",
      }),
    );
    const codes = matches.filter((m) => m.value === "847293");
    expect(codes).toHaveLength(1);
  });

  it("sorts results by confidence descending", () => {
    const matches = extractVerification(
      input({
        bodyText: "Your code is 111111\n\n222222\n\n",
        bodyHtml: '<a href="https://acme.com/verify?token=t">Verify</a>',
      }),
    );
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1]?.confidence ?? 0).toBeGreaterThanOrEqual(matches[i]?.confidence ?? 0);
    }
  });
});

describe("extractVerification - linear time on adversarial input (pentest H1)", () => {
  const N = 200_000;
  const cases: Array<[string, Partial<{ bodyText: string; bodyHtml: string; subject: string }>]> = [
    ["spaces after a label", { bodyText: "verification" + " ".repeat(N) }],
    ["spaces after a label in HTML", { bodyHtml: "verification" + " ".repeat(N) }],
    ["'<b' repeated", { bodyHtml: "<b".repeat(N / 2) }],
    ["'<span' repeated with a style", { bodyHtml: "<span style=\"font-size:32px\"".repeat(N / 28) }],
    ["'<a ' repeated", { bodyHtml: "<a href='x' ".repeat(N / 12) }],
    ["unclosed anchors", { bodyHtml: "<a href=\"https://x.example/verify\">".repeat(N / 34) }],
    ["label repetition", { bodyText: "verification code is ".repeat(N / 21) }],
    ["label repetition in HTML", { bodyHtml: "verification code is ".repeat(N / 21) }],
    ["newlines and spaces", { bodyText: "\n ".repeat(N / 2) }],
    ["spaced digits without an end", { bodyText: "1 ".repeat(N / 2) + "x" }],
    ["link keywords without a URL", { bodyText: "verify ".repeat(N / 7) }],
    ["'<' without '>'", { bodyHtml: "<".repeat(N) }],
    ["a long subject", { subject: "verification" + " ".repeat(N) }],
  ];
  // The quadratic patterns took 12 s at 120k chars and over 60 s at 200k; linear code takes a few ms here. A budget
  // of 1 s, best of three runs, catches any return of the blow-up without failing on a slow or busy CI runner
  // (100 ms did: 153 ms on GitHub's runners).
  const BUDGET_MS = 1000;
  const fastest = (run: () => void): number => {
    let best = Infinity;
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = performance.now();
      run();
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };
  for (const [name, body] of cases) {
    it(`finishes ${name} (${N} chars) in linear time`, () => {
      expect(fastest(() => extractVerification(input(body)))).toBeLessThan(BUDGET_MS);
    });
  }

  it("still finds a code at the start of a huge body", () => {
    const matches = extractVerification(input({ bodyText: "Your verification code is 847293\n" + "x ".repeat(1_000_000) }));
    expect(matches[0]?.value).toBe("847293");
  });
});
