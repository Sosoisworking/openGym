// The Tarnished mark: a kettlebell overgrown with moss, a few rust specks on the bell. Drawn
// from the theme's own colours, so it follows dark and light (resources/icon.svg is the
// fixed-colour app icon).
export default function Logo({ size = 54 }) {
  return (
    <svg viewBox="18 14 64 80" width={size * 0.8} height={size} aria-hidden="true">
      <path d="M33 46C31 18 69 18 67 46" fill="none" stroke="var(--label)" strokeWidth="9" strokeLinecap="round" />
      <circle cx="50" cy="62" r="28" fill="var(--label)" />
      <path d="M24 54C22 40 34 33 50 33C66 33 78 40 76 54C72 50 68 56 63 52C59 57 54 51 50 55C46 50 41 57 37 52C32 56 28 50 24 54Z" fill="var(--green)" />
      <path d="M0 0C3-5 10-6 14 0C10 6 3 5 0 0Z" fill="var(--green)" transform="translate(60 22) rotate(-30) scale(1.2)" />
      <circle cx="40" cy="72" r="2.6" fill="var(--red)" />
      <circle cx="62" cy="78" r="1.9" fill="var(--red)" />
      <circle cx="58" cy="67" r="1.4" fill="var(--red)" />
    </svg>
  )
}
