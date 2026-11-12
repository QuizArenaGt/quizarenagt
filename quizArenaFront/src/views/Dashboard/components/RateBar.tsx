import { formatRate } from '../../../models/roomReport';

interface RateBarProps {
    /** Taxa de 0 a 1. */
    rate: number;
    /** Texto de apoio, ex.: "5 de 6 acertaram". */
    detail?: string;
}

/** VIEW — barra horizontal com a porcentagem de acerto. */
export default function RateBar({ rate, detail }: RateBarProps) {
    const tone = rate >= 0.7 ? 'good' : rate >= 0.4 ? 'medium' : 'low';

    return (
        <div className="rate-bar">
            <div className="rate-bar__track" aria-hidden="true">
                <span className={`rate-bar__fill rate-bar__fill--${tone}`} style={{ width: formatRate(rate) }} />
            </div>
            <span className="rate-bar__value">
                {formatRate(rate)}
                {detail && <span className="rate-bar__detail"> · {detail}</span>}
            </span>
        </div>
    );
}
