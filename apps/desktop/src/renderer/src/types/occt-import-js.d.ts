/**
 * Minimal typings for occt-import-js (the OpenCascade CAD kernel compiled to
 * WebAssembly). The package ships no declarations; only the STEP entry point is
 * declared here, matching how `lib/meshLoaders.ts` calls it.
 */
declare module 'occt-import-js' {
  interface OcctAttribute {
    array: number[]
  }

  interface OcctMesh {
    name?: string
    attributes: {
      position: OcctAttribute
      normal?: OcctAttribute
    }
    index?: OcctAttribute
  }

  interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
  }

  interface Occt {
    ReadStepFile(content: Uint8Array, params: null): OcctResult
  }

  /** The module default export is a factory returning a promise of the runtime. */
  const factory: () => Promise<Occt>
  export default factory
}
