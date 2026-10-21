import { Composition } from 'remotion'
import { Promo, TOTAL } from './Promo'
import { VLOG_TOTAL, Vlog } from './Vlog'

export const Root = () => (
  <>
    <Composition id="Vlog" component={Vlog} durationInFrames={VLOG_TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Promo" component={Promo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
  </>
)
