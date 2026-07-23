# Catálogo de Equipos Celucenter

Catálogo web de equipos (teléfonos, tablets, accesorios) de Celucenter con las 3 listas de almacenes unificadas: **BM**, **Ecom** y **LAFT**.

## Almacenes

- **BM** – Bodega Mayoreo
- **Ecom** – Bodega Ecomerce (mercancía regresada, Open Box, Grado A/B/C)
- **LAFT** – Almacén LAFT

## Estructura

- `index.html` – Página principal del catálogo (login + filtros + productos + pedido por WhatsApp)
- `equipos_apps_script.gs` – Backend en Google Apps Script (GET catálogo, login, POST registro)

## Google Sheet

- ID: `1dN0Z8RER0i1bWwWvy6uHz2A_A7dg7mI1KzWTEzSnrdY`
- Pestañas:
  - `Lista General BM`
  - `Lista General Ecom`
  - `Lista General LAFT`
  - `Registro` – usuarios autorizados

## Despliegue del Apps Script

1. Abrir Google Sheets → Extensiones → Apps Script
2. Pegar el contenido de `equipos_apps_script.gs`
3. **Deploy → New deployment**
4. Tipo: **Web app**
5. Execute as: **Me**, Access: **Anyone**
6. Copiar la URL del deployment
7. Actualizar `APPS_SCRIPT_URL` en `index.html`

## Despliegue del HTML

El HTML se publica vía GitHub Pages desde la rama `main`.

## Lista de precios por usuario

Cada usuario registrado se le asigna una lista en la columna E de la pestaña `Registro`:
- `M` – Lista Mayoreo
- `G` – Lista Grande
- `F` – Lista Full
- `TODAS` – Admin (ve las 3 listas stacked)

## Flujo del cliente

1. Entra al catálogo → login con teléfono
2. Si no está registrado: nombre + teléfono + email → registro + notificación a Cris
3. Admin asigna lista en la pestaña `Registro`
4. Cliente ve precios correspondientes + puede pedir por WhatsApp directamente
