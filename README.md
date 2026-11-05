# Hulpapp

Een kleine vraag-en-antwoord site voor je eigen omgeving. Mensen die je kent stellen een vraag,
jij krijgt een **Discord melding** en beantwoordt de vraag op de site.

- Eerste bezoek = setup van het **eigenaar-account** (jij)
- Anderen komen erin via een **uitnodigingslink** (eenmalig, met vervaldatum) en hebben hun eigen inlog
- Vragen als gesprek: heen-en-weer reageren, afronden, heropenen
- Discord webhook, ping-ID, site-naam en publieke URL stel je in **via de website** — geen secrets in de env
- Ongelezen-markeringen voor jou en de vraagsteller
- Wachtwoorden met scrypt, CSRF-bescherming, rate limit op inloggen
- SQLite in `/data`, geen externe database nodig

## Installeren met Docker Compose

De image wordt automatisch gebouwd door GitHub Actions bij elke push naar `main`
(`linux/amd64` en `linux/arm64`) en gepubliceerd als `ghcr.io/iitssjstn/hulpapp:latest`.

```yaml
services:
  hulpapp:
    image: ghcr.io/iitssjstn/hulpapp:latest
    container_name: hulpapp
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - TZ=Europe/Amsterdam
    volumes:
      - hulpapp-data:/data

volumes:
  hulpapp-data:
```

```bash
docker compose up -d
```

Open daarna `http://<server>:3000` en maak je eigenaar-account aan.

> **Bind mount in plaats van volume?** De container draait als gebruiker `node` (uid 1000).
> Gebruik je bijv. `./data:/data`, doe dan eerst `mkdir data && sudo chown 1000:1000 data`.

> **Repo privé?** Dan is het package op GHCR ook privé. Maak het publiek via
> GitHub → je profiel → Packages → hulpapp → Package settings → Change visibility,
> of log op je server in met `docker login ghcr.io`.

## Discord instellen

1. Discord → kanaal-instellingen → **Integraties → Webhooks → Nieuwe webhook** → URL kopiëren
2. Op de site: **Instellingen** → plak de webhook URL → Opslaan → **Test versturen**
3. Optioneel: vul je Discord gebruikers-ID in, dan word je getagd en krijg je een push-melding
   (Ontwikkelaarsmodus aan → rechtsklik op jezelf → *Gebruikers-ID kopiëren*)

Je krijgt een melding bij nieuwe vragen, nieuwe accounts en (instelbaar) nieuwe reacties.

## Reverse proxy

Zet de site achter je eigen reverse proxy (Nginx Proxy Manager, Traefik, Caddy…) voor HTTPS.
`X-Forwarded-Proto` wordt vertrouwd vanaf private netwerken, zodat cookies dan automatisch `Secure` zijn.
Vul bij Instellingen de **publieke URL** in (bijv. `https://hulp.jouwdomein.nl`) zodat links in
Discord en uitnodigingen kloppen.

## Omgevingsvariabelen (allemaal optioneel)

| Variabele  | Standaard          | Uitleg                          |
|------------|--------------------|---------------------------------|
| `PORT`     | `3000`             | Poort in de container           |
| `DATA_DIR` | `/data`            | Map voor de SQLite database     |
| `TZ`       | `Europe/Amsterdam` | Tijdzone voor datums op de site |

## Lokaal ontwikkelen

Vereist Node.js 22.13+ (gebruikt de ingebouwde `node:sqlite`).

```bash
npm install
npm run dev
```

## Wachtwoord vergeten?

- **Gebruiker:** als eigenaar ga je naar *Gebruikers* → *Wachtwoord resetten* (tijdelijk wachtwoord).
- **Eigenaar:** stop de container, en verwijder de database om opnieuw te beginnen
  (`/data/hulpapp.db`) — let op: dan ben je alle data kwijt.
