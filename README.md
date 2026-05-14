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

DNS points `libremotor.com` at GitHub Pages through Cloudflare. Cloudflare is
the user-facing TLS edge while GitHub Pages manages the static origin.

## Cloudflare cutover

When a valid Cloudflare token is available, apply the DNS records with:

```sh
./scripts/configure-cloudflare-pages.sh
```

The script reads `LIBREMOTOR_CLOUDFLARE_TOKEN` or `CLOUDFLARE_TOKEN` from the
environment first, then from `/home/sabino/code/sabino/labs/azure-improvements/.env`.
It creates proxied GitHub Pages records for the apex domain and `www` by
default. Set `PROXIED=false` only when intentionally switching back to DNS-only
records for GitHub-managed certificate issuance.

The token must be a Cloudflare API token with `Zone:Read` and `DNS:Edit`
permissions for the `libremotor.com` zone.

Use a dry run to preview the record changes:

```sh
DRY_RUN=1 ./scripts/configure-cloudflare-pages.sh
```

Apply proxied records:

```sh
PROXIED=true ./scripts/configure-cloudflare-pages.sh
```
