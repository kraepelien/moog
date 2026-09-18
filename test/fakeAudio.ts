/* An audio context that records instead of sounding.
 *
 * happy-dom has no Web Audio at all, and the parts of the engine worth pinning
 * are not what it sounds like but what it does: how many oscillators it builds,
 * what it schedules and when, and what it leaves alone. Those are all visible
 * from the calls themselves.
 *
 * Only the factory methods are faked, which is why the engine uses those rather
 * than the constructor forms: one surface to keep honest.
 */

export interface Call {
  readonly param: FakeParam
  readonly method: string
  readonly value: number
  readonly time: number
}

export class FakeParam {
  value = 0
  readonly calls: Call[] = []

  readonly owner: string
  readonly name: string
  private readonly log: Call[]

  constructor(owner: string, name: string, log: Call[]) {
    this.owner = owner
    this.name = name
    this.log = log
  }

  private record(method: string, value: number, time: number) {
    const call = { param: this, method, value, time }
    this.calls.push(call)
    this.log.push(call)
    this.value = value
  }

  setValueAtTime(value: number, time: number) {
    this.record('setValueAtTime', value, time)
    return this
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.record('linearRampToValueAtTime', value, time)
    return this
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    this.record('exponentialRampToValueAtTime', value, time)
    return this
  }

  setTargetAtTime(value: number, time: number, constant: number) {
    this.record('setTargetAtTime', value, time)
    void constant
    return this
  }

  cancelScheduledValues(time: number) {
    this.record('cancelScheduledValues', Number.NaN, time)
    return this
  }

  /* Every call this param has seen, in order, for a test that cares about the
     shape of a schedule rather than one value. */
  methods(): string[] {
    return this.calls.map((call) => call.method)
  }
}

class FakeNode {
  readonly connected: FakeNode[] = []
  started = 0
  stopped = 0

  readonly kind: string

  constructor(kind: string) {
    this.kind = kind
  }

  connect(target: FakeNode | FakeParam) {
    this.connected.push(target as FakeNode)
    return target as FakeNode
  }

  disconnect() {}

  start() {
    this.started += 1
  }

  stop() {
    this.stopped += 1
  }
}

export class FakeContext {
  currentTime = 0
  readonly sampleRate = 48000
  state: 'running' | 'suspended' | 'closed' = 'running'
  readonly destination = new FakeNode('destination')
  readonly nodes: FakeNode[] = []
  readonly calls: Call[] = []
  resumed = 0
  periodicWaves = 0

  private make<T extends FakeNode>(node: T): T {
    this.nodes.push(node)
    return node
  }

  private param(owner: string, name: string) {
    return new FakeParam(owner, name, this.calls)
  }

  of(kind: string): FakeNode[] {
    return this.nodes.filter((node) => node.kind === kind)
  }

  createGain() {
    const node = this.make(new FakeNode('gain')) as FakeNode & { gain: FakeParam }
    node.gain = this.param('gain', 'gain')
    return node
  }

  createOscillator() {
    const node = this.make(new FakeNode('oscillator')) as FakeNode & {
      frequency: FakeParam
      detune: FakeParam
      type: string
      wave: unknown
      setPeriodicWave: (wave: unknown) => void
    }
    node.frequency = this.param('oscillator', 'frequency')
    node.detune = this.param('oscillator', 'detune')
    node.setPeriodicWave = (wave: unknown) => {
      node.wave = wave
    }
    return node
  }

  createConstantSource() {
    const node = this.make(new FakeNode('constant')) as FakeNode & { offset: FakeParam }
    node.offset = this.param('constant', 'offset')
    return node
  }

  createBiquadFilter() {
    const node = this.make(new FakeNode('filter')) as FakeNode & {
      frequency: FakeParam
      detune: FakeParam
      Q: FakeParam
      type: string
    }
    node.frequency = this.param('filter', 'frequency')
    node.detune = this.param('filter', 'detune')
    node.Q = this.param('filter', 'Q')
    return node
  }

  createBufferSource() {
    const node = this.make(new FakeNode('buffer')) as FakeNode & {
      buffer: unknown
      loop: boolean
    }
    return node
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length)
    void channels
    void sampleRate
    return { getChannelData: () => data, length }
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    this.periodicWaves += 1
    return { real, imag }
  }

  resume() {
    this.resumed += 1
    this.state = 'running'
    return Promise.resolve()
  }

  close() {
    this.state = 'closed'
    return Promise.resolve()
  }

  /* Tests move time by hand: the engine only ever reads currentTime, so this is
     the whole of the clock it lives under. */
  advance(seconds: number) {
    this.currentTime += seconds
  }
}

export const fakeContext = () => new FakeContext() as unknown as BaseAudioContext & FakeContext
