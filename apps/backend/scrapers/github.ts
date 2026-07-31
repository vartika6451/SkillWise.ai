import axios from "axios";

export async function scrapeGithub(username: string) {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/vnd.github.v3+json",
  };

  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  // 1. Fetch user's own public repositories
  console.log(`[GitHub Scraper] Fetching owned repos for: ${username}`);
  let ownedRepos: any[] = [];
  try {
    const response = await axios.get(
      `https://api.github.com/users/${username}/repos`,
      { headers }
    );
    ownedRepos = response.data.map((repo: any) => ({
      name: repo.name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      url: repo.html_url,
      isContribution: false,
    }));
  } catch (err: any) {
    console.error(`[GitHub Scraper] Failed to fetch owned repos:`, err.message);
    throw err;
  }

  // 2. Scan for contributed repositories (where the user is not the owner)
  const contributedRepoNames = new Set<string>();
  const lowerUsername = username.toLowerCase();

  // A. Search pull requests authored by the user to identify external projects
  console.log(`[GitHub Scraper] Fetching PR contributions for: ${username}`);
  try {
    const prSearchResponse = await axios.get(
      `https://api.github.com/search/issues?q=type:pr+author:${username}`,
      { headers }
    );
    if (prSearchResponse.data && prSearchResponse.data.items) {
      prSearchResponse.data.items.forEach((item: any) => {
        if (item.repository_url) {
          const parts = item.repository_url.split("/repos/");
          if (parts[1]) {
            const repoFullName = parts[1]; // format: "owner/repo"
            const owner = repoFullName.split("/")[0]?.toLowerCase();
            if (owner && owner !== lowerUsername) {
              contributedRepoNames.add(repoFullName);
            }
          }
        }
      });
    }
  } catch (err: any) {
    console.warn(`[GitHub Scraper] PR search warning (could be rate limit):`, err.message);
  }

  // B. Query user public events to capture recent commit/issue/PR activity in other repos
  console.log(`[GitHub Scraper] Fetching public events for: ${username}`);
  try {
    const eventsResponse = await axios.get(
      `https://api.github.com/users/${username}/events/public`,
      { headers }
    );
    if (Array.isArray(eventsResponse.data)) {
      eventsResponse.data.forEach((event: any) => {
        if (event.repo && event.repo.name) {
          const repoFullName = event.repo.name; // format: "owner/repo"
          const owner = repoFullName.split("/")[0]?.toLowerCase();
          if (owner && owner !== lowerUsername) {
            contributedRepoNames.add(repoFullName);
          }
        }
      });
    }
  } catch (err: any) {
    console.warn(`[GitHub Scraper] Public events fetch warning:`, err.message);
  }

  // C. Search commits authored by the user to identify direct commits to external repositories
  console.log(`[GitHub Scraper] Fetching commit contributions for: ${username}`);
  try {
    const commitsResponse = await axios.get(
      `https://api.github.com/search/commits?q=author:${username}`,
      {
        headers: {
          ...headers,
          "Accept": "application/vnd.github.cloak-preview,application/vnd.github.v3+json"
        }
      }
    );
    if (commitsResponse.data && commitsResponse.data.items) {
      commitsResponse.data.items.forEach((item: any) => {
        if (item.repository && item.repository.full_name) {
          const repoFullName = item.repository.full_name; // format: "owner/repo"
          const owner = repoFullName.split("/")[0]?.toLowerCase();
          if (owner && owner !== lowerUsername) {
            contributedRepoNames.add(repoFullName);
          }
        }
      });
    }
  } catch (err: any) {
    console.warn(`[GitHub Scraper] Commit search warning (could be rate limit):`, err.message);
  }

  // 3. Resolve metadata details for the contributed repos
  // Capping at 8 to avoid hitting API rate limits
  const contributedReposList = Array.from(contributedRepoNames).slice(0, 8);
  const contributedRepos: any[] = [];

  console.log(`[GitHub Scraper] Resolving details for ${contributedReposList.length} external contributed repos`);
  for (const repoFullName of contributedReposList) {
    try {
      const repoResponse = await axios.get(
        `https://api.github.com/repos/${repoFullName}`,
        { headers }
      );
      const repo = repoResponse.data;
      contributedRepos.push({
        name: repo.full_name, // Use owner/repo to cleanly identify it in the checklist
        description: repo.description,
        stars: repo.stargazers_count,
        language: repo.language,
        url: repo.html_url,
        isContribution: true,
      });
    } catch (err: any) {
      console.warn(`[GitHub Scraper] Failed to fetch details for ${repoFullName}:`, err.message);
    }
  }

  // Combine owned repositories and external contributions
  return [...ownedRepos, ...contributedRepos];
}