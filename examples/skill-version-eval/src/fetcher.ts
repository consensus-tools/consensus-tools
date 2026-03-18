import { execFileSync } from "child_process";

interface SkillRepo {
  owner: string;
  repo: string;
  label: string;
  skillDirs: string[];
}

const REPOS: SkillRepo[] = [
  {
    owner: "garrytan",
    repo: "gstack",
    label: "gstack",
    skillDirs: [
      "qa",
      "qa-only",
      "browse",
      "review",
      "ship",
      "retro",
      "plan-ceo-review",
      "plan-eng-review",
      "plan-design-review",
      "qa-design-review",
      "document-release",
      "setup-browser-cookies",
    ],
  },
];

export function listRepos(): SkillRepo[] {
  return REPOS;
}

export function listSkills(repoLabel: string): string[] {
  const repo = REPOS.find((r) => r.label === repoLabel);
  return repo?.skillDirs ?? [];
}

export interface VersionEntry {
  name: string;
  sha: string; // short commit SHA
}

export function listVersions(
  owner: string,
  repo: string,
): { tags: VersionEntry[]; branches: VersionEntry[] } {
  try {
    // Tags — GitHub returns newest first already
    const tagsOut = execFileSync(
      "gh",
      ["api", `repos/${owner}/${repo}/tags?per_page=30`, "--jq", `[.[] | {name: .name, sha: .commit.sha[:7]}]`],
      { encoding: "utf-8", timeout: 15000 },
    );
    const tags: VersionEntry[] = JSON.parse(tagsOut || "[]");

    // Branches — put main/master first, then alphabetical
    const branchesOut = execFileSync(
      "gh",
      ["api", `repos/${owner}/${repo}/branches?per_page=50`, "--jq", `[.[] | {name: .name, sha: .commit.sha[:7]}]`],
      { encoding: "utf-8", timeout: 15000 },
    );
    const rawBranches: VersionEntry[] = JSON.parse(branchesOut || "[]");
    const mainBranches = rawBranches.filter(b => b.name === "main" || b.name === "master");
    const otherBranches = rawBranches.filter(b => b.name !== "main" && b.name !== "master");
    const branches = [...mainBranches, ...otherBranches];

    return { tags, branches };
  } catch (err: any) {
    console.error("Failed to list versions:", err.message);
    return { tags: [], branches: [] };
  }
}

export function fetchSkillAt(
  owner: string,
  repo: string,
  skill: string,
  ref: string,
): string | null {
  try {
    const filePath = `${skill}/SKILL.md`;
    const encodedRef = encodeURIComponent(ref);
    const result = execFileSync(
      "gh",
      [
        "api",
        `repos/${owner}/${repo}/contents/${filePath}?ref=${encodedRef}`,
        "-H",
        "Accept: application/vnd.github.raw+json",
      ],
      { encoding: "utf-8", timeout: 15000 },
    );
    return result || null;
  } catch {
    return null;
  }
}
