export type UpdateRelease = {
  versionCode: number;
  versionName: string;
  notes: string;
  date: string;
  apkUrl: string;
  sha256: string;
  size: number;
  signingSha256?: string;
};

export type UpdateManifest = {
  latest: UpdateRelease | null;
  minSupported: number;
  releases: UpdateRelease[];
};

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  created_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
};

const repository = process.env.GITHUB_RELEASE_REPOSITORY || "jadiel054/plutao-os";
const apiBase = `https://api.github.com/repos/${repository}`;

async function githubFetch<T>(url: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "plutao-os-update-manifest",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function readReleaseMetadata(release: GitHubRelease): Promise<UpdateRelease | null> {
  const asset = release.assets.find((item) => item.name === "release-metadata.json");
  if (!asset) return null;
  try {
    const metadata = await githubFetch<UpdateRelease>(asset.browser_download_url);
    if (!metadata.apkUrl || !metadata.sha256 || !metadata.versionName || !metadata.versionCode) return null;
    return metadata;
  } catch {
    return null;
  }
}

export async function getUpdateManifest(): Promise<UpdateManifest> {
  try {
    const releases = await githubFetch<GitHubRelease[]>(`${apiBase}/releases?per_page=10`);
    const published = releases.filter((release) => !release.draft && !release.prerelease);
    const resolved = (await Promise.all(published.map(readReleaseMetadata))).filter(
      (release): release is UpdateRelease => release !== null,
    );
    resolved.sort((a, b) => b.versionCode - a.versionCode);
    const configuredMinimum = Number.parseInt(process.env.MIN_SUPPORTED_VERSION_CODE || "1", 10);
    return {
      latest: resolved[0] || null,
      minSupported: Number.isFinite(configuredMinimum) && configuredMinimum > 0 ? configuredMinimum : 1,
      releases: resolved.slice(0, 5),
    };
  } catch {
    return { latest: null, minSupported: 1, releases: [] };
  }
}
