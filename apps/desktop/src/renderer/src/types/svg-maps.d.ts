declare module '@svg-maps/world' {
  const world: {
    label: string
    viewBox: string
    locations: { id: string; name: string; path: string }[]
  }
  export default world
}
