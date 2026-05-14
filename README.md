# Libremotor Web

Static website for `libremotor.com`.

The public website explains the project, risks, requirements, and next steps in
English and Portuguese. Vehicle-specific compatibility internals belong in the
Hub and technical repositories, not in public landing-page copy.

## Local preview

Open `index.html` directly in a browser or run:

```sh
python3 -m http.server 8090
```

## Deployment

The repo is prepared for GitHub Pages:

- `CNAME` points to `libremotor.com`.
- `.github/workflows/pages.yml` publishes the static directory from `main`.
- `robots.txt` and `sitemap.xml` describe the public pages.

DNS still needs to point `libremotor.com` at GitHub Pages before the custom
domain is live.

## Cloudflare cutover

When a valid Cloudflare token is available, apply the DNS records with:

```sh
./scripts/configure-cloudflare-pages.sh
```

The script reads `CLOUDFLARE_TOKEN` from the environment first, then from
`/home/sabino/code/sabino/labs/azure-improvements/.env`. It creates DNS-only
GitHub Pages records for the apex domain and `www`.

Use a dry run to preview the record changes:

```sh
DRY_RUN=1 ./scripts/configure-cloudflare-pages.sh
```
