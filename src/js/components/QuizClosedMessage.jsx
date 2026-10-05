import { PALETTE, DISPLAY_FONT } from '../theme.js';
import { StarDivider } from './atoms.jsx';

export function QuizClosedMessage({ quiz }) {
  return (
    <div className="rounded-2xl p-8 sm:p-12 text-center" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, boxShadow: `0 10px 40px -12px ${PALETTE.ink}22` }}>
      <StarDivider />
      <h2 className="text-xl sm:text-2xl mt-4 mb-3" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.red, fontWeight: 700 }}>
        Sarado na po ang {quiz?.title || 'Quiz'}
      </h2>
      <p className="text-sm sm:text-base max-w-md mx-auto" style={{ color: PALETTE.inkSoft }}>
        Pero pwede po kayo sumagot sa iba pang Quiz na OPEN pa, eto ang link sa Quiz :
        <br /><br />
        <a href="https://sulutions.cloud/NMAWebinar/" target="_blank" rel="noopener noreferrer" style={{ color: PALETTE.emerald, fontWeight: 700 }}>
          https://sulutions.cloud/NMAWebinar/
        </a>
        <br /><br />
        Alway follow at share po ang{' '}
        <a href="https://www.facebook.com/newmuslimph/" target="_blank" rel="noopener noreferrer" style={{ color: PALETTE.emerald, fontWeight: 700 }}>
          https://www.facebook.com/newmuslimph/
        </a>{' '}
        pa lagi kayong updated <span style={{ color: PALETTE.emerald, fontWeight: 700 }}>#NewMuslimPH</span>
      </p>
    </div>
  );
}
