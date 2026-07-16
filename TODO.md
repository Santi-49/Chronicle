# TODO

## To Build

### Landing Page (`apps/landing/`)
- [ ] Hero section with 3D element
- [ ] Product / solution pitch section
- [ ] Call to action (link to web app / app store)
- [ ] Scroll animations (GSAP ScrollTrigger)
- [ ] Deploy to Cloudflare Pages

### Frontend Basics (`apps/web/`)
- [ ] Login page (connects to `POST /api/v1/auth/login`)
- [ ] Register page (connects to `POST /api/v1/auth/register`)
- [ ] Settings page
  - [ ] Change password
  - [ ] Role management (admin view — assign/remove roles)
- [ ] Protected route wrapper (JWT refresh on expiry)
- [ ] API client setup (generated types from `make generate-types`)

### App Basics (`apps/mobile/`)
- [ ] Auth flow (login / register screens)
- [ ] Navigation shell (tabs or stack — decide after challenge context is set)
- [ ] Settings screen (change password, logout)
- [ ] API client wired to backend (mirror web API client)

### Research — Expo Go Deployment
- [ ] Decide distribution method for hackathon demo:
  - Expo Go (fastest — no build needed, requires Expo SDK compatibility)
  - EAS Build internal distribution (APK / IPA, no app store)
  - EAS Build + TestFlight / Play Store internal track
- [ ] Check if any native modules used (expo-gl, expo-dev-client) break Expo Go compatibility
- [ ] Document chosen approach in `docs/challenge/CONSTRAINTS.md`

## Final

- [ ] Review and update `README.md`
