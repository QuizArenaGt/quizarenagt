import './SectionHeading.css';

interface SectionHeadingProps {
    /** Id do título, usado pela seção em aria-labelledby. */
    id: string;
    eyebrow: string;
    title: string;
    description?: string;
}

/** Cabeçalho padrão das seções: rótulo curto, título e texto de apoio. */
export default function SectionHeading({ id, eyebrow, title, description }: SectionHeadingProps) {
    return (
        <div className="ui-section-heading">
            <p className="ui-section-heading__eyebrow">{eyebrow}</p>
            <h2 id={id} className="ui-section-heading__title">
                {title}
            </h2>
            {description && <p className="ui-section-heading__description">{description}</p>}
        </div>
    );
}
