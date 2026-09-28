import { useEffect } from 'react'
import { Shell } from './Shell'
import { useGame } from '../store/useGame'

export function App() {
  /*
    Часы тренажёра: раз в секунду стор двигает отправления и время на
    экране. Момент этапа считается от оформления, поэтому пропущенный
    тик (вкладка в фоне) ничего не меняет в исходе — мир догонит.
  */
  useEffect(() => {
    const id = setInterval(() => useGame.getState().tick(), 1000)
    return () => clearInterval(id)
  }, [])

  return <Shell />
}
