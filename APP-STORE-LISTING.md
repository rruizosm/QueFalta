# Ficha de App Store Connect — QuéFalta

> Contenido listo para pegar en App Store Connect (ASC). App ID `6777720373`,
> bundle `com.quefalta.app`, Team `LX4BLQDZS4`. App **gratis** (sin compras
> activas). Idiomas: Español (España) primario + Catalán.
>
> ASC tiene DOS páginas distintas:
> 1. **App Information** (datos generales, no cambian por versión).
> 2. **Versión 1.0** (textos, capturas y datos que se revisan en cada envío).

---

## 1) App Information  (Información de la app)

| Campo | Valor |
|---|---|
| **Name** (es-ES) | `QuéFalta` |
| **Name** (ca) | `QuèFalta` |
| **Subtitle** (es-ES, ≤30) | `La compra en grupo, organizada` |
| **Subtitle** (ca, ≤30) | `La compra en grup, organitzada` |
| **Bundle ID** | `com.quefalta.app` (com.quefalta.app — XC) |
| **SKU** | `quefalta-ios-001` |
| **Primary Category** | **Compras** (Shopping) |
| **Secondary Category** | **Comida y bebida** (Food & Drink) |
| **Content Rights** | Sí, contiene contenido de terceros y dispongo de derechos/permiso para usarlo |
| **Age Rating** | 4+ (ver cuestionario en §4) |
| **Privacy Policy URL** | `https://quefalta.es/privacidad` |
| **User Access** | Full Access |

> ⚠️ La **Privacy Policy URL** es obligatoria y la página tiene que estar PUBLICADA
> antes de enviar a revisión (hoy `quefalta-web` no está desplegada). Si no quieres
> esperar a la web, sirve una página simple en `quefalta.es/privacidad`.

---

## 2) Versión 1.0  (datos de la versión que se revisa)

### Promotional text (≤170, se puede cambiar sin revisión)
**es-ES:**
```
Organiza la compra con tu grupo en tiempo real: una sola lista compartida, catálogo real de Mercadona y de tus súpers, y la cesta ordenada por pasillos.
```
**ca:**
```
Organitza la compra amb el teu grup en temps real: una sola llista compartida, catàleg real de Mercadona i dels teus súpers, i el cistell ordenat per passadissos.
```

### Description
**es-ES:**
```
QuéFalta es la forma más fácil de organizar la compra en grupo.

Crea una lista compartida con tu pareja, tu familia o tus compañeros de piso y mantenla sincronizada en tiempo real: lo que añade uno lo ven todos al instante.

• Lista compartida en grupo, en tiempo real.
• Catálogo real de Mercadona y de otros supermercados, con fotos y precios.
• Busca productos y añádelos a la cesta con un toque.
• Cesta ordenada por pasillos del súper para que no des vueltas.
• Notificaciones cuando alguien cambia la lista.
• Disponible en español y catalán.

Inicia sesión con Apple, Google o tu correo. Tus datos están protegidos y puedes borrar tu cuenta cuando quieras.

QuéFalta no está afiliada a Mercadona ni a ningún supermercado; los precios y la información de producto son orientativos.
```
**ca:**
```
QuèFalta és la manera més fàcil d'organitzar la compra en grup.

Crea una llista compartida amb la teva parella, la teva família o els teus companys de pis i mantén-la sincronitzada en temps real: el que afegeix un, ho veuen tots a l'instant.

• Llista compartida en grup, en temps real.
• Catàleg real de Mercadona i d'altres supermercats, amb fotos i preus.
• Cerca productes i afegeix-los al cistell amb un toc.
• Cistell ordenat per passadissos del súper perquè no donis voltes.
• Notificacions quan algú canvia la llista.
• Disponible en català i castellà.

Inicia la sessió amb Apple, Google o el teu correu. Les teves dades estan protegides i pots esborrar el teu compte quan vulguis.

QuèFalta no està afiliada a Mercadona ni a cap supermercat; els preus i la informació de producte són orientatius.
```

### Keywords (≤100 caracteres, separadas por comas, sin espacios tras la coma)
**es-ES:**
```
lista compra,supermercado,mercadona,compra grupo,lista compartida,cesta,ahorro,carrito,super
```
**ca:**
```
llista compra,supermercat,mercadona,compra grup,llista compartida,cistell,estalvi,carro,super
```

### URLs
| Campo | Valor |
|---|---|
| **Support URL** (obligatoria) | `https://quefalta.es/soporte` (o `mailto:` si no hay web aún) |
| **Marketing URL** (opcional) | `https://quefalta.es` |

### Otros
| Campo | Valor |
|---|---|
| **Version** | `1.0.0` |
| **Copyright** | `© 2026 Rubén Ruiz` |
| **What's New** (1.0) | No aplica en el primer envío (o "Primera versión de QuéFalta.") |

---

## 3) App Review Information  (datos para el revisor de Apple)

⚠️ **CRÍTICO**: la app exige inicio de sesión → Apple **rechaza** si no le das una
cuenta de prueba que funcione y con datos dentro (un grupo con lista).

⚠️ **El login es SOLO Google + Apple** (no hay email/contraseña). Una cuenta creada
a mano en Supabase NO sirve. La forma de dar acceso al revisor es una **cuenta de
Google real** (con 2FA desactivado) cuyas credenciales puedes compartir.

| Campo | Valor |
|---|---|
| **Sign-in required** | Sí |
| **Demo account – User** | `review.quefalta@gmail.com` (cuenta Google dedicada, 2FA OFF) |
| **Demo account – Password** | (contraseña de esa cuenta Google) |
| **Contact – First/Last name** | Rubén Ruiz |
| **Contact – Phone / Email** | (tu teléfono) / `rruizosma@gmail.com` |
| **Notes** | Ver texto abajo |

**Pasos previos para preparar la cuenta de revisión:**
1. Crear una cuenta Gmail dedicada (p. ej. `review.quefalta@gmail.com`).
2. **Desactivar la verificación en 2 pasos** de esa cuenta (si no, el revisor no
   puede pasar el desafío al iniciar sesión con Google).
3. Entrar una vez en la app con esa cuenta (botón "Continuar con Google"),
   completar el onboarding (@usuario + súpers) y dejarle **un grupo con una lista
   con productos** para que el revisor vea la app con datos.

**Notes (pegar):**
```
Para iniciar sesión, pulsad "Continuar con Google" y usad la cuenta indicada
(review.quefalta@gmail.com). Esa cuenta ya tiene el onboarding hecho y un grupo
con una lista compartida para que podáis ver todas las funciones. (La app también
ofrece "Iniciar sesión con Apple"; si lo preferís, podéis usar vuestro Apple ID,
pero entraréis en una cuenta nueva y vacía.)

QuéFalta muestra datos de catálogo (nombres, fotos y precios) de supermercados como
Mercadona con fines de lista de la compra; no es una app oficial de ningún
supermercado y no procesa pagos de productos. Las notificaciones requieren
dispositivo físico.
```

---

## 4) Age Rating (cuestionario) → 4+
Responde **None / Ninguno** a todas las categorías (violencia, sexo, lenguaje,
sustancias, juego/apuestas). **Unrestricted Web Access: No.** **User Generated
Content:** la app tiene nombres de grupo/usuario; si ASC lo pregunta, marca el
mínimo (sin que cambie de 4+). Resultado esperado: **4+**.

---

## 5) App Privacy (etiquetas de privacidad) — sección aparte, también obligatoria
Backend = Supabase. Datos que recoges (declarar "Linked to user", normalmente **NO**
usados para tracking):
- **Contact Info → Email address** (login).
- **Contact Info → Name** (perfil / Apple/Google).
- **User Content → Photos** (avatar opcional) y otro contenido de usuario (listas, grupos).
- **Identifiers → User ID** (id de Supabase).
- **Usage Data / Diagnostics**: solo si activas analítica (hoy no → marca No).
- **Push token** se usa para notificaciones (no es tracking).
Marca **"Data is NOT used to track you"** salvo que añadas SDKs de publicidad.

---

## 6) Pendientes / bloqueos antes de poder enviar
- [ ] **Privacy Policy URL** publicada y accesible (`quefalta.es/privacidad`).
- [ ] **Support URL** accesible (`quefalta.es/soporte` o un `mailto:`).
- [ ] **Cuenta de revisión** creada en Supabase con un grupo + lista con datos.
- [ ] **Capturas** subidas (ver §7).
- [ ] Build de producción subido vía `eas submit` y seleccionado en la versión.

---

## 7) Capturas (Screenshots) — requisitos
- **iPhone 6.9"/6.7"** (p. ej. 1290×2796 o 1320×2868): **OBLIGATORIAS** (3–10).
- **iPad 13"**: OBLIGATORIAS **solo si la app soporta iPad**.

> ⚠️ `app.json` tiene `ios.supportsTablet: true`. Si NO vas a optimizar/iPad ni
> subir capturas de iPad, pon `supportsTablet: false` y rebuild — así evitas tener
> que aportar capturas de iPad y que te revisen en iPad. Decisión recomendada para
> el primer envío: **false** (es una app de iPhone).
