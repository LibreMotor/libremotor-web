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
