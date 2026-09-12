import assert from 'node:assert/strict'
import { emit, fixture, ok } from '../tests/helpers'

async function main(): Promise<void> {
  for (const count of [20, 100]) {
    const f = await fixture()
    try {
      const clients = await Promise.all(Array.from({ length: count }, () => f.connect()))
      const ids = await Promise.all(
        clients.map(
          async (c) =>
            ok(await emit(c, 'room:join', { roomId: f.server.activeRoom.id })).identity
              .participantId
        )
      )
      assert.equal(new Set(ids).size, count)
      const observedWinners = new Set<string>()
      f.host.on('buzz:state', (buzz) => {
        if (buzz.winner) observedWinners.add(buzz.winner.participantId)
      })
      for (const round of [1, 2]) {
        observedWinners.clear()
        const start = performance.now()
        const results = await Promise.all(
          clients.map((c) => emit(c, 'buzz:press', { roundId: round }))
        )
        results.forEach(ok)
        const buzz = f.server.activeRoom.buzz
        assert.equal(buzz.acceptedCount, count)
        assert.equal(buzz.ranking.length, 10)
        assert.equal(new Set(buzz.ranking.map((e) => e.participantId)).size, 10)
        assert.equal(new Set(results.map((r) => ok(r).winner?.participantId)).size, 1)
        assert.ok(buzz.winner)
        const duplicate = await emit(clients[0], 'buzz:press', { roundId: round })
        assert.equal(duplicate.ok, false)
        ok(await emit(f.host, 'ppt:refresh', {})) // Round-trip flush for host broadcasts.
        assert.equal(observedWinners.size, 1)
        console.info(
          `PASS clients=${count} round=${round} accepted=${buzz.acceptedCount} winners=1 ranking=10 elapsed=${Math.round(performance.now() - start)}ms`
        )
        ok(await emit(f.host, 'buzz:reset', {}))
        assert.equal(f.server.activeRoom.buzz.winner, null)
      }
    } finally {
      await f.close()
    }
  }
  console.info('Consistency/stability check only; not a network fairness benchmark.')
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
