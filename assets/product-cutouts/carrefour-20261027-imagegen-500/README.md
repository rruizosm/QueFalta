# Carrefour: tanda adicional de 500 con ImageGen

Encargo del usuario: continuar 500 productos adicionales con agentes en paralelo
y el flujo aprobado de ImageGen → PNG transparente → `illustration_url`.
No sustituir los cinco ya publicados. Excluir Papelería, Bazar y Calzado,
incluidos productos con esas categorías entre varias pertenencias.

Selección fija: productos publicados y disponibles sin ilustración, foto
oficial válida y fuentes únicas; 36 categorías. Tres lotes exclusivos de
167/167/166, más 50 reservas por lote. `batch.json` protege las cinco URL previas.
Cada agente guarda prompts, PNG nativos y recibos por producto. Por orden del
usuario del 28-10, tras generar y verificar la salida se borra la foto fuente
descargada y se conserva su SHA-256 en el recibo (`sourceDeleted: true`).
`scripts/cleanup-carrefour-imagegen-sources.mjs` aplica esa limpieza; el auditor
admite el hash conservado tras el borrado autorizado. No redescargar completados.
`worker-ownership.json` conserva el reparto ajustado entre agentes y root.

Método: una llamada de ImageGen integrado por fotografía oficial, transparencia
real, conservación del alfa nativo. No usar el recorte por umbral rechazado.
Revisar cada resultado antes de marcar `visualReviewAccepted: true`.
Si la herramienta informa de cuota, registrar `PAUSE` global y no lanzar más
generaciones hasta resolver ese límite. Conservar las salidas en vuelo.

Auditar estado local: `node scripts/carrefour-imagegen-500.mjs`.
Publicar revisados: `node --env-file=.env.local scripts/carrefour-imagegen-500.mjs --publish`.
El publicador verifica fuente, alfa, SHA-256, exclusiones, estado actual,
URL previa nula, archivo remoto HTTP/MIME/hash y relectura de enlace.
`publication.json` conserva progreso durable por producto. `thumbnail` no cambia.

No se publica ninguna versión de la app como parte de este lote.
