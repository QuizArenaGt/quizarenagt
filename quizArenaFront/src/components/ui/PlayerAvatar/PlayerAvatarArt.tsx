import type { ReactNode } from 'react';
import { type PlayerAvatarId, resolvePlayerAvatarId } from '../../../models/avatars';

const INK = '#1E1B4B';

interface PlayerAvatarArtProps {
    avatarId: string | null | undefined;
    className?: string;
}

function renderAvatarCharacter(id: PlayerAvatarId): ReactNode {
    switch (id) {
        case 'explorer':
            return (
                <g>
                    {/* Jaqueta e lenço de aventura */}
                    <path d="M21 96 C23 75 34 69 48 69 C62 69 73 75 75 96 Z" fill="#D97706" stroke={INK} strokeWidth="2.4" />
                    <path d="M35 70 L48 84 L61 70" fill="#0EA5E9" stroke={INK} strokeWidth="2.2" />
                    <circle cx="48" cy="79" r="3.4" fill="#FDE047" stroke={INK} strokeWidth="1.8" />
                    {/* Orelhas */}
                    <circle cx="26" cy="51" r="6" fill="#FDBA74" stroke={INK} strokeWidth="2.2" />
                    <circle cx="70" cy="51" r="6" fill="#FDBA74" stroke={INK} strokeWidth="2.2" />
                    {/* Rosto */}
                    <rect x="27" y="29" width="42" height="40" rx="20" fill="#FED7AA" stroke={INK} strokeWidth="2.4" />
                    {/* Cabelo lateral */}
                    <path d="M27 42 C27 33 34 29 48 29 C62 29 69 33 69 42" fill="#78350F" />
                    {/* Olhos com brilho */}
                    <circle cx="39" cy="49" r="3.8" fill={INK} />
                    <circle cx="57" cy="49" r="3.8" fill={INK} />
                    <circle cx="40.3" cy="47.6" r="1.4" fill="#FFFFFF" />
                    <circle cx="58.3" cy="47.6" r="1.4" fill="#FFFFFF" />
                    {/* Bochechas e sorriso */}
                    <ellipse cx="34" cy="55" rx="3.4" ry="2" fill="#FB7185" opacity="0.55" />
                    <ellipse cx="62" cy="55" rx="3.4" ry="2" fill="#FB7185" opacity="0.55" />
                    <path d="M41 58 Q48 64 55 58" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                    {/* Chapéu de expedição */}
                    <path d="M27 36 C28 21 36 16 48 16 C60 16 68 21 69 36 Z" fill="#EAB308" stroke={INK} strokeWidth="2.4" />
                    <path d="M28 33 H68" stroke="#0284C7" strokeWidth="4" />
                    <ellipse cx="48" cy="36" rx="28" ry="6.2" fill="#FACC15" stroke={INK} strokeWidth="2.4" />
                    <circle cx="48" cy="25" r="3.2" fill="#FEF08A" stroke={INK} strokeWidth="1.8" />
                </g>
            );

        case 'fox':
            return (
                <g>
                    {/* Peito e cachecol */}
                    <path d="M20 96 C22 76 33 70 48 70 C63 70 74 76 76 96 Z" fill="#EA580C" stroke={INK} strokeWidth="2.4" />
                    <path d="M36 72 L48 92 L60 72 Z" fill="#FFF7ED" />
                    <path d="M30 71 Q48 79 66 71 L63 79 Q48 86 33 79 Z" fill="#0D9488" stroke={INK} strokeWidth="2.1" />
                    {/* Orelhas pontudas */}
                    <path d="M26 42 L20 17 L41 29 Z" fill="#F97316" stroke={INK} strokeWidth="2.4" />
                    <path d="M70 42 L76 17 L55 29 Z" fill="#F97316" stroke={INK} strokeWidth="2.4" />
                    <path d="M27 37 L24 23 L36 30 Z" fill="#FED7AA" />
                    <path d="M69 37 L72 23 L60 30 Z" fill="#FED7AA" />
                    {/* Cabeça */}
                    <ellipse cx="48" cy="50" rx="24" ry="21" fill="#F97316" stroke={INK} strokeWidth="2.4" />
                    {/* Bochechas creme */}
                    <path d="M24 50 C25 63 36 70 48 70 C60 70 71 63 72 50 C63 50 56 54 48 61 C40 54 33 50 24 50 Z" fill="#FFF7ED" stroke={INK} strokeWidth="2" />
                    {/* Olhos */}
                    <circle cx="38" cy="46" r="3.8" fill={INK} />
                    <circle cx="58" cy="46" r="3.8" fill={INK} />
                    <circle cx="39.3" cy="44.7" r="1.4" fill="#FFFFFF" />
                    <circle cx="59.3" cy="44.7" r="1.4" fill="#FFFFFF" />
                    {/* Nariz e sorriso */}
                    <ellipse cx="48" cy="55" rx="4.2" ry="3" fill={INK} />
                    <path d="M43 61 Q48 65 53 61" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
                </g>
            );

        case 'robot':
            return (
                <g>
                    {/* Antena */}
                    <line x1="48" y1="22" x2="48" y2="12" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
                    <circle cx="48" cy="11" r="4.5" fill="#38BDF8" stroke={INK} strokeWidth="2.2" />
                    {/* Corpo / ombros */}
                    <path d="M21 96 C23 76 33 70 48 70 C63 70 73 76 75 96 Z" fill="#6366F1" stroke={INK} strokeWidth="2.4" />
                    <rect x="38" y="77" width="20" height="10" rx="4" fill="#A5B4FC" stroke={INK} strokeWidth="2" />
                    <circle cx="43" cy="82" r="2" fill="#22D3EE" />
                    <circle cx="53" cy="82" r="2" fill="#FDE047" />
                    {/* Fones laterais */}
                    <rect x="19" y="40" width="7" height="17" rx="3.5" fill="#4F46E5" stroke={INK} strokeWidth="2.2" />
                    <rect x="70" y="40" width="7" height="17" rx="3.5" fill="#4F46E5" stroke={INK} strokeWidth="2.2" />
                    {/* Cabeça metálica */}
                    <rect x="24" y="23" width="48" height="44" rx="16" fill="#E0E7FF" stroke={INK} strokeWidth="2.4" />
                    {/* Visor */}
                    <rect x="30" y="33" width="36" height="24" rx="9" fill="#1E1B4B" stroke={INK} strokeWidth="2" />
                    {/* Olhos LED */}
                    <circle cx="40" cy="44" r="4.2" fill="#38BDF8" />
                    <circle cx="56" cy="44" r="4.2" fill="#38BDF8" />
                    <circle cx="41.2" cy="42.7" r="1.4" fill="#FFFFFF" />
                    <circle cx="57.2" cy="42.7" r="1.4" fill="#FFFFFF" />
                    <path d="M43 52 Q48 56 53 52" fill="none" stroke="#67E8F9" strokeWidth="2.2" strokeLinecap="round" />
                </g>
            );

        case 'cat':
            return (
                <g>
                    {/* Corpo e coleira com guizo */}
                    <path d="M21 96 C23 76 34 70 48 70 C62 70 73 76 75 96 Z" fill="#A855F7" stroke={INK} strokeWidth="2.4" />
                    <path d="M31 71 Q48 78 65 71" fill="none" stroke="#F43F5E" strokeWidth="4.5" strokeLinecap="round" />
                    <circle cx="48" cy="78" r="4.8" fill="#FACC15" stroke={INK} strokeWidth="2" />
                    {/* Orelhas */}
                    <path d="M27 40 L25 18 L43 29 Z" fill="#F3E8FF" stroke={INK} strokeWidth="2.4" />
                    <path d="M69 40 L71 18 L53 29 Z" fill="#F3E8FF" stroke={INK} strokeWidth="2.4" />
                    <path d="M29 36 L28 24 L38 30 Z" fill="#F9A8D4" />
                    <path d="M67 36 L68 24 L58 30 Z" fill="#F9A8D4" />
                    {/* Cabeça */}
                    <ellipse cx="48" cy="50" rx="23" ry="20" fill="#FAF5FF" stroke={INK} strokeWidth="2.4" />
                    {/* Listra na testa */}
                    <path d="M48 30 V37 M43 31 L44 36 M53 31 L52 36" stroke="#C084FC" strokeWidth="2.4" strokeLinecap="round" />
                    {/* Olhos */}
                    <circle cx="38" cy="48" r="3.9" fill={INK} />
                    <circle cx="58" cy="48" r="3.9" fill={INK} />
                    <circle cx="39.3" cy="46.6" r="1.4" fill="#FFFFFF" />
                    <circle cx="59.3" cy="46.6" r="1.4" fill="#FFFFFF" />
                    {/* Nariz e bigodes */}
                    <polygon points="48,56 44.5,52.5 51.5,52.5" fill="#F472B6" />
                    <path d="M42 58 Q45 61 48 58 Q51 61 54 58" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
                    <path d="M21 50 L30 51 M21 55 L30 54 M75 50 L66 51 M75 55 L66 54" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
                </g>
            );

        case 'frog':
            return (
                <g>
                    {/* Corpo */}
                    <path d="M20 96 C23 76 33 70 48 70 C63 70 73 76 76 96 Z" fill="#22C55E" stroke={INK} strokeWidth="2.4" />
                    <ellipse cx="48" cy="84" rx="14" ry="12" fill="#FEF08A" />
                    {/* Olhos saltados no topo */}
                    <circle cx="33" cy="31" r="10.5" fill="#4ADE80" stroke={INK} strokeWidth="2.4" />
                    <circle cx="63" cy="31" r="10.5" fill="#4ADE80" stroke={INK} strokeWidth="2.4" />
                    <circle cx="33" cy="31" r="6.4" fill="#FFFFFF" stroke={INK} strokeWidth="1.8" />
                    <circle cx="63" cy="31" r="6.4" fill="#FFFFFF" stroke={INK} strokeWidth="1.8" />
                    <circle cx="33" cy="31" r="3.5" fill={INK} />
                    <circle cx="63" cy="31" r="3.5" fill={INK} />
                    <circle cx="34.2" cy="29.6" r="1.3" fill="#FFFFFF" />
                    <circle cx="64.2" cy="29.6" r="1.3" fill="#FFFFFF" />
                    {/* Cabeça larga */}
                    <ellipse cx="48" cy="52" rx="25" ry="19" fill="#4ADE80" stroke={INK} strokeWidth="2.4" />
                    {/* Bochechas e sorriso */}
                    <ellipse cx="32" cy="54" rx="4.4" ry="2.6" fill="#FB7185" opacity="0.6" />
                    <ellipse cx="64" cy="54" rx="4.4" ry="2.6" fill="#FB7185" opacity="0.6" />
                    <circle cx="44" cy="48" r="1.3" fill={INK} />
                    <circle cx="52" cy="48" r="1.3" fill={INK} />
                    <path d="M36 56 Q48 66 60 56" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                </g>
            );

        case 'alien':
            return (
                <g>
                    {/* Traje espacial */}
                    <path d="M21 96 C23 76 34 70 48 70 C62 70 73 76 75 96 Z" fill="#7C3AED" stroke={INK} strokeWidth="2.4" />
                    <path d="M35 72 L48 83 L61 72" fill="#2DD4BF" stroke={INK} strokeWidth="2" />
                    {/* Duas antenas */}
                    <line x1="36" y1="28" x2="29" y2="15" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                    <line x1="60" y1="28" x2="67" y2="15" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                    <circle cx="28" cy="14" r="4.2" fill="#FDE047" stroke={INK} strokeWidth="2" />
                    <circle cx="68" cy="14" r="4.2" fill="#FDE047" stroke={INK} strokeWidth="2" />
                    {/* Cabeça */}
                    <path d="M24 46 C24 30 34 24 48 24 C62 24 72 30 72 46 C72 60 61 70 48 70 C35 70 24 60 24 46 Z" fill="#2DD4BF" stroke={INK} strokeWidth="2.4" />
                    {/* Olhos grandes espaciais */}
                    <ellipse cx="38" cy="47" rx="5.5" ry="6.8" fill={INK} />
                    <ellipse cx="58" cy="47" rx="5.5" ry="6.8" fill={INK} />
                    <circle cx="39.8" cy="44.5" r="2.1" fill="#FFFFFF" />
                    <circle cx="59.8" cy="44.5" r="2.1" fill="#FFFFFF" />
                    <circle cx="36.5" cy="49.5" r="1.1" fill="#99F6E4" />
                    <circle cx="56.5" cy="49.5" r="1.1" fill="#99F6E4" />
                    {/* Sorriso simpático */}
                    <path d="M42 59 Q48 64 54 59" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                </g>
            );

        case 'dino':
            return (
                <g>
                    {/* Crista coral no topo */}
                    <polygon points="35,29 40,17 47,26" fill="#F97316" stroke={INK} strokeWidth="2.1" />
                    <polygon points="46,26 52,15 58,27" fill="#F97316" stroke={INK} strokeWidth="2.1" />
                    <polygon points="57,28 65,20 67,33" fill="#F97316" stroke={INK} strokeWidth="2.1" />
                    {/* Corpo */}
                    <path d="M20 96 C23 76 34 70 48 70 C62 70 73 76 76 96 Z" fill="#65A30D" stroke={INK} strokeWidth="2.4" />
                    <ellipse cx="48" cy="85" rx="13" ry="11" fill="#FEF08A" />
                    {/* Cabeça */}
                    <rect x="24" y="26" width="48" height="43" rx="20" fill="#84CC16" stroke={INK} strokeWidth="2.4" />
                    {/* Focinho claro */}
                    <ellipse cx="48" cy="56" rx="18" ry="11" fill="#D9F99D" stroke={INK} strokeWidth="1.9" />
                    {/* Olhos */}
                    <circle cx="37" cy="41" r="4" fill={INK} />
                    <circle cx="59" cy="41" r="4" fill={INK} />
                    <circle cx="38.3" cy="39.5" r="1.4" fill="#FFFFFF" />
                    <circle cx="60.3" cy="39.5" r="1.4" fill="#FFFFFF" />
                    {/* Narinas e sorriso com dentinho */}
                    <circle cx="44" cy="52" r="1.6" fill={INK} />
                    <circle cx="52" cy="52" r="1.6" fill={INK} />
                    <path d="M38 58 Q48 65 58 58" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                    <polygon points="53,60 56,64 58,58" fill="#FFFFFF" stroke={INK} strokeWidth="1.4" />
                </g>
            );

        case 'dj':
            return (
                <g>
                    {/* Arco do headphone */}
                    <path d="M22 48 C22 21 34 15 48 15 C62 15 74 21 74 48" fill="none" stroke="#9333EA" strokeWidth="6" strokeLinecap="round" />
                    <path d="M22 48 C22 21 34 15 48 15 C62 15 74 21 74 48" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
                    {/* Hoodie */}
                    <path d="M20 96 C22 76 34 70 48 70 C62 70 74 76 76 96 Z" fill="#DB2777" stroke={INK} strokeWidth="2.4" />
                    <path d="M37 71 L48 84 L59 71" fill="#4C1D95" stroke={INK} strokeWidth="2" />
                    {/* Cabeça */}
                    <rect x="26" y="26" width="44" height="43" rx="20" fill="#FDBA74" stroke={INK} strokeWidth="2.4" />
                    {/* Cabelo estilizado */}
                    <path d="M27 39 C29 25 40 22 52 24 C63 26 69 32 70 39 C61 33 38 33 27 39 Z" fill="#1E1B4B" />
                    {/* Conchas do fone */}
                    <rect x="17" y="40" width="10" height="20" rx="5" fill="#EC4899" stroke={INK} strokeWidth="2.2" />
                    <rect x="69" y="40" width="10" height="20" rx="5" fill="#EC4899" stroke={INK} strokeWidth="2.2" />
                    {/* Óculos neon */}
                    <rect x="29" y="42" width="16" height="11" rx="4" fill="#1E1B4B" stroke="#F472B6" strokeWidth="2" />
                    <rect x="51" y="42" width="16" height="11" rx="4" fill="#1E1B4B" stroke="#F472B6" strokeWidth="2" />
                    <line x1="45" y1="47" x2="51" y2="47" stroke={INK} strokeWidth="2.4" />
                    <line x1="33" y1="45" x2="38" y2="50" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
                    <line x1="55" y1="45" x2="60" y2="50" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
                    {/* Sorriso */}
                    <path d="M41 59 Q48 64 55 58" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                </g>
            );

        case 'astronaut':
            return (
                <g>
                    {/* Traje espacial */}
                    <path d="M19 96 C22 76 34 70 48 70 C62 70 74 76 77 96 Z" fill="#F8FAFC" stroke={INK} strokeWidth="2.4" />
                    <path d="M32 72 H64" stroke="#0284C7" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="48" cy="83" r="4" fill="#F97316" stroke={INK} strokeWidth="1.8" />
                    {/* Capacete */}
                    <circle cx="48" cy="45" r="26" fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />
                    {/* Visor azulado */}
                    <rect x="28" y="28" width="40" height="31" rx="15" fill="#0F172A" stroke="#38BDF8" strokeWidth="2.4" />
                    {/* Reflexo do visor */}
                    <path d="M33 34 Q38 30 44 32" fill="none" stroke="#7DD3FC" strokeWidth="2.5" strokeLinecap="round" />
                    {/* Olhos dentro do capacete */}
                    <circle cx="40" cy="44" r="3.4" fill="#38BDF8" />
                    <circle cx="56" cy="44" r="3.4" fill="#38BDF8" />
                    <circle cx="41" cy="42.8" r="1.2" fill="#FFFFFF" />
                    <circle cx="57" cy="42.8" r="1.2" fill="#FFFFFF" />
                    <path d="M43 51 Q48 55 53 51" fill="none" stroke="#E0F2FE" strokeWidth="2.1" strokeLinecap="round" />
                </g>
            );

        case 'panda':
            return (
                <g>
                    {/* Orelhas pretas */}
                    <circle cx="28" cy="27" r="9.5" fill={INK} />
                    <circle cx="68" cy="27" r="9.5" fill={INK} />
                    {/* Corpo e cachecol verde */}
                    <path d="M21 96 C23 76 34 70 48 70 C62 70 73 76 75 96 Z" fill="#1E1B4B" stroke={INK} strokeWidth="2.4" />
                    <path d="M30 71 Q48 79 66 71 L63 80 Q48 86 33 80 Z" fill="#84CC16" stroke={INK} strokeWidth="2.1" />
                    {/* Cabeça */}
                    <ellipse cx="48" cy="49" rx="24" ry="21" fill="#FFFFFF" stroke={INK} strokeWidth="2.4" />
                    {/* Manchas oculares */}
                    <ellipse cx="37" cy="47" rx="7.2" ry="8.4" transform="rotate(-14 37 47)" fill={INK} />
                    <ellipse cx="59" cy="47" rx="7.2" ry="8.4" transform="rotate(14 59 47)" fill={INK} />
                    <circle cx="38" cy="46" r="2.8" fill="#FFFFFF" />
                    <circle cx="58" cy="46" r="2.8" fill="#FFFFFF" />
                    <circle cx="38" cy="46" r="1.3" fill={INK} />
                    <circle cx="58" cy="46" r="1.3" fill={INK} />
                    {/* Nariz e sorriso */}
                    <ellipse cx="48" cy="56" rx="4" ry="2.8" fill={INK} />
                    <path d="M43 61 Q48 64 53 61" fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
                </g>
            );

        case 'inventor':
            return (
                <g>
                    {/* Avental / gravata borboleta */}
                    <path d="M21 96 C23 76 34 70 48 70 C62 70 73 76 75 96 Z" fill="#F43F5E" stroke={INK} strokeWidth="2.4" />
                    <path d="M36 70 L48 92 L60 70 Z" fill="#FFF1F2" stroke={INK} strokeWidth="2" />
                    <polygon points="48,78 41,74 41,82" fill="#F59E0B" stroke={INK} strokeWidth="1.6" />
                    <polygon points="48,78 55,74 55,82" fill="#F59E0B" stroke={INK} strokeWidth="1.6" />
                    {/* Cabelo volumoso */}
                    <circle cx="27" cy="45" r="10" fill="#9D174D" stroke={INK} strokeWidth="2.2" />
                    <circle cx="69" cy="45" r="10" fill="#9D174D" stroke={INK} strokeWidth="2.2" />
                    <ellipse cx="48" cy="34" rx="22" ry="15" fill="#BE185D" stroke={INK} strokeWidth="2.4" />
                    {/* Rosto */}
                    <rect x="27" y="31" width="42" height="39" rx="19" fill="#FDE68A" stroke={INK} strokeWidth="2.4" />
                    {/* Óculos de oficina na testa */}
                    <rect x="28" y="25" width="40" height="8" rx="4" fill="#B45309" stroke={INK} strokeWidth="1.8" />
                    <circle cx="38" cy="29" r="7.2" fill="#38BDF8" stroke="#F59E0B" strokeWidth="3" />
                    <circle cx="58" cy="29" r="7.2" fill="#38BDF8" stroke="#F59E0B" strokeWidth="3" />
                    <circle cx="38" cy="29" r="7.2" fill="none" stroke={INK} strokeWidth="1.6" />
                    <circle cx="58" cy="29" r="7.2" fill="none" stroke={INK} strokeWidth="1.6" />
                    {/* Olhos e sorriso */}
                    <circle cx="39" cy="49" r="3.7" fill={INK} />
                    <circle cx="57" cy="49" r="3.7" fill={INK} />
                    <circle cx="40.2" cy="47.6" r="1.4" fill="#FFFFFF" />
                    <circle cx="58.2" cy="47.6" r="1.4" fill="#FFFFFF" />
                    <path d="M41 58 Q48 64 55 58" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                </g>
            );

        case 'pirate':
            return (
                <g>
                    {/* Camisa listrada náutica */}
                    <path d="M20 96 C23 76 34 70 48 70 C62 70 73 76 76 96 Z" fill="#0F172A" stroke={INK} strokeWidth="2.4" />
                    <path d="M27 80 H69 M24 89 H72" stroke="#F8FAFC" strokeWidth="3.5" />
                    {/* Brinco dourado */}
                    <circle cx="24" cy="54" r="3.6" fill="none" stroke="#FACC15" strokeWidth="2.4" />
                    {/* Rosto */}
                    <rect x="26" y="29" width="44" height="41" rx="20" fill="#FDBA74" stroke={INK} strokeWidth="2.4" />
                    {/* Bandana vermelha */}
                    <path d="M26 39 C26 24 36 18 48 18 C60 18 70 24 70 39 Z" fill="#EF4444" stroke={INK} strokeWidth="2.4" />
                    <circle cx="48" cy="28" r="3" fill="#FEF2F2" />
                    {/* Tapa-olho */}
                    <line x1="27" y1="42" x2="69" y2="50" stroke={INK} strokeWidth="2.6" />
                    <circle cx="38" cy="47" r="6.4" fill={INK} />
                    {/* Olho bom */}
                    <circle cx="58" cy="47" r="3.8" fill={INK} />
                    <circle cx="59.3" cy="45.6" r="1.4" fill="#FFFFFF" />
                    {/* Sorriso maroto */}
                    <path d="M41 58 Q49 63 57 57" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                </g>
            );

        case 'bee':
            return (
                <g>
                    {/* Asinhas laterais */}
                    <ellipse cx="21" cy="64" rx="9" ry="13" transform="rotate(-24 21 64)" fill="#F0F9FF" stroke={INK} strokeWidth="2" />
                    <ellipse cx="75" cy="64" rx="9" ry="13" transform="rotate(24 75 64)" fill="#F0F9FF" stroke={INK} strokeWidth="2" />
                    {/* Corpo listrado */}
                    <path d="M22 96 C24 76 35 70 48 70 C61 70 72 76 74 96 Z" fill="#FACC15" stroke={INK} strokeWidth="2.4" />
                    <path d="M29 79 H67 M25 89 H71" stroke={INK} strokeWidth="4.5" />
                    {/* Antenas */}
                    <path d="M39 27 Q35 16 29 15" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                    <path d="M57 27 Q61 16 67 15" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                    <circle cx="28" cy="15" r="3.6" fill="#F59E0B" stroke={INK} strokeWidth="2" />
                    <circle cx="68" cy="15" r="3.6" fill="#F59E0B" stroke={INK} strokeWidth="2" />
                    {/* Cabeça fofa */}
                    <ellipse cx="48" cy="49" rx="23" ry="20" fill="#FDE047" stroke={INK} strokeWidth="2.4" />
                    {/* Olhos e bochechas */}
                    <circle cx="38" cy="47" r="3.9" fill={INK} />
                    <circle cx="58" cy="47" r="3.9" fill={INK} />
                    <circle cx="39.3" cy="45.6" r="1.4" fill="#FFFFFF" />
                    <circle cx="59.3" cy="45.6" r="1.4" fill="#FFFFFF" />
                    <ellipse cx="32" cy="53" rx="3.8" ry="2.2" fill="#FB7185" opacity="0.6" />
                    <ellipse cx="64" cy="53" rx="3.8" ry="2.2" fill="#FB7185" opacity="0.6" />
                    <path d="M41 56 Q48 62 55 56" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                </g>
            );

        case 'wizard':
            return (
                <g>
                    {/* Manto e barba mágica */}
                    <path d="M20 96 C22 76 34 70 48 70 C62 70 74 76 76 96 Z" fill="#4C1D95" stroke={INK} strokeWidth="2.4" />
                    <circle cx="48" cy="79" r="3.8" fill="#FACC15" stroke={INK} strokeWidth="1.6" />
                    {/* Rosto */}
                    <rect x="28" y="34" width="40" height="36" rx="18" fill="#FED7AA" stroke={INK} strokeWidth="2.4" />
                    {/* Barba estilizada */}
                    <path d="M31 56 C33 72 41 79 48 80 C55 79 63 72 65 56 Q48 63 31 56 Z" fill="#F1F5F9" stroke={INK} strokeWidth="2.2" />
                    {/* Olhos sábios */}
                    <circle cx="39" cy="48" r="3.6" fill={INK} />
                    <circle cx="57" cy="48" r="3.6" fill={INK} />
                    <circle cx="40.2" cy="46.8" r="1.3" fill="#FFFFFF" />
                    <circle cx="58.2" cy="46.8" r="1.3" fill="#FFFFFF" />
                    <path d="M43 58 Q48 62 53 58" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
                    {/* Chapéu estrelado */}
                    <path d="M30 37 L46 9 L66 37 Z" fill="#5B21B6" stroke={INK} strokeWidth="2.4" />
                    <ellipse cx="48" cy="37" rx="28" ry="6" fill="#6D28D9" stroke={INK} strokeWidth="2.4" />
                    <path d="M32 34 H64" stroke="#FACC15" strokeWidth="3.2" />
                    <circle cx="48" cy="24" r="2.6" fill="#FDE047" />
                </g>
            );

        case 'red-panda':
            return (
                <g>
                    {/* Corpo e gola creme */}
                    <path d="M21 96 C23 76 34 70 48 70 C62 70 73 76 75 96 Z" fill="#C2410C" stroke={INK} strokeWidth="2.4" />
                    <path d="M32 71 Q48 79 64 71 L60 80 Q48 85 36 80 Z" fill="#0F766E" stroke={INK} strokeWidth="2" />
                    {/* Orelhas arredondadas */}
                    <circle cx="27" cy="30" r="9.5" fill="#9A3412" stroke={INK} strokeWidth="2.3" />
                    <circle cx="69" cy="30" r="9.5" fill="#9A3412" stroke={INK} strokeWidth="2.3" />
                    <circle cx="27" cy="30" r="5" fill="#FFF7ED" />
                    <circle cx="69" cy="30" r="5" fill="#FFF7ED" />
                    {/* Cabeça */}
                    <ellipse cx="48" cy="50" rx="23" ry="20" fill="#EA580C" stroke={INK} strokeWidth="2.4" />
                    {/* Sobrancelhas creme */}
                    <ellipse cx="38" cy="39" rx="4.2" ry="2.4" fill="#FFF7ED" />
                    <ellipse cx="58" cy="39" rx="4.2" ry="2.4" fill="#FFF7ED" />
                    {/* Focinho creme */}
                    <ellipse cx="48" cy="57" rx="14" ry="10" fill="#FFF7ED" stroke={INK} strokeWidth="1.9" />
                    {/* Olhos */}
                    <circle cx="38" cy="47" r="3.8" fill={INK} />
                    <circle cx="58" cy="47" r="3.8" fill={INK} />
                    <circle cx="39.3" cy="45.6" r="1.4" fill="#FFFFFF" />
                    <circle cx="59.3" cy="45.6" r="1.4" fill="#FFFFFF" />
                    {/* Nariz e sorriso */}
                    <ellipse cx="48" cy="55" rx="3.8" ry="2.6" fill={INK} />
                    <path d="M43 60 Q48 64 53 60" fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
                </g>
            );

        case 'monster':
            return (
                <g>
                    {/* Corpo fofo */}
                    <path d="M20 96 C22 76 34 70 48 70 C62 70 74 76 76 96 Z" fill="#A21CAF" stroke={INK} strokeWidth="2.4" />
                    <ellipse cx="48" cy="86" rx="13" ry="9" fill="#F5D0FE" />
                    {/* Chifrinhos */}
                    <path d="M31 32 Q25 18 33 14 Q38 19 39 29 Z" fill="#FEF08A" stroke={INK} strokeWidth="2.2" />
                    <path d="M65 32 Q71 18 63 14 Q58 19 57 29 Z" fill="#FEF08A" stroke={INK} strokeWidth="2.2" />
                    {/* Cabeça arredondada */}
                    <ellipse cx="48" cy="50" rx="24" ry="21" fill="#D946EF" stroke={INK} strokeWidth="2.4" />
                    {/* Olhos expressivos */}
                    <circle cx="38" cy="45" r="5.6" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
                    <circle cx="58" cy="45" r="5.6" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
                    <circle cx="38.5" cy="45" r="3" fill={INK} />
                    <circle cx="57.5" cy="45" r="3" fill={INK} />
                    <circle cx="39.5" cy="43.8" r="1.1" fill="#FFFFFF" />
                    <circle cx="58.5" cy="43.8" r="1.1" fill="#FFFFFF" />
                    {/* Pintinhas nas bochechas */}
                    <circle cx="29" cy="53" r="2.2" fill="#A21CAF" opacity="0.45" />
                    <circle cx="67" cy="53" r="2.2" fill="#A21CAF" opacity="0.45" />
                    {/* Sorriso travesso com dentinhos */}
                    <path d="M37 56 Q48 65 59 56" fill={INK} stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
                    <polygon points="41,57 44,61 46,57" fill="#FFFFFF" />
                    <polygon points="50,57 52,61 55,57" fill="#FFFFFF" />
                </g>
            );

        case 'rockstar':
            return (
                <g>
                    {/* Cabelo comprido preso atrás caindo além dos ombros */}
                    <path d="M25 44 C19 61 20 77 25 89 L32 82 L31 44 Z" fill="#27272A" stroke={INK} strokeWidth="2.3" />
                    <path d="M71 44 C77 61 76 77 71 89 L64 82 L65 44 Z" fill="#27272A" stroke={INK} strokeWidth="2.3" />
                    {/* Braços com tatuagens estilizadas */}
                    <path d="M18 96 C20 85 23 80 28 79 L32 96 Z" fill="#FDBA74" stroke={INK} strokeWidth="2.2" />
                    <path d="M78 96 C76 85 73 80 68 79 L64 96 Z" fill="#FDBA74" stroke={INK} strokeWidth="2.2" />
                    <path d="M21 88 Q25 86 28 89 M20 93 Q24 91 27 94" fill="none" stroke="#334155" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M75 88 Q71 86 68 89 M76 93 Q72 91 69 94" fill="none" stroke="#334155" strokeWidth="1.9" strokeLinecap="round" />
                    {/* Camiseta preta simples com colar discreto */}
                    <path d="M24 96 L26 78 C29 72 37 69 48 69 C59 69 67 72 70 78 L72 96 Z" fill="#18181B" stroke={INK} strokeWidth="2.4" />
                    <path d="M38 70 Q48 78 58 70" fill="none" stroke="#3F3F46" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M40 71 Q48 83 56 71" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
                    <polygon points="48,83 45.5,79 50.5,79" fill="#CBD5E1" stroke={INK} strokeWidth="1.2" />
                    {/* Orelhas e brinco discreto */}
                    <circle cx="26" cy="49" r="5.5" fill="#FDBA74" stroke={INK} strokeWidth="2.2" />
                    <circle cx="70" cy="49" r="5.5" fill="#FDBA74" stroke={INK} strokeWidth="2.2" />
                    <circle cx="25.5" cy="54.2" r="2.1" fill="none" stroke="#CBD5E1" strokeWidth="1.8" />
                    {/* Rosto definido */}
                    <path
                        d="M28 36 C28 29 36 27 48 27 C60 27 68 29 68 36 L67 51 C66 63 58 69 48 69 C38 69 30 63 29 51 Z"
                        fill="#FED7AA"
                        stroke={INK}
                        strokeWidth="2.4"
                    />
                    {/* Volume superior do cabelo penteado para trás */}
                    <path
                        d="M27 42 C25 22 36 14 48 14 C60 14 71 22 69 42 C64 31 57 29 48 29 C39 29 32 31 27 42 Z"
                        fill="#27272A"
                        stroke={INK}
                        strokeWidth="2.4"
                    />
                    <path d="M36 22 Q48 18 60 22 M39 26 Q48 23 57 26" fill="none" stroke="#52525B" strokeWidth="1.8" strokeLinecap="round" />
                    {/* Barba e bigode conectados bem definidos */}
                    <path
                        d="M29 49 L32 51 C34 59 40 62 48 62 C56 62 62 59 64 51 L67 49 C67 62 59 71 48 71 C37 71 29 62 29 49 Z"
                        fill="#27272A"
                        stroke={INK}
                        strokeWidth="2.2"
                    />
                    <path d="M38 56 Q48 52 58 56 Q53 59 48 57.5 Q43 59 38 56 Z" fill="#27272A" stroke={INK} strokeWidth="1.8" />
                    {/* Expressão séria com toque irônico nas sobrancelhas e boca */}
                    <path d="M34 40 Q39 39 44 41" fill="none" stroke="#18181B" strokeWidth="2.6" strokeLinecap="round" />
                    <path d="M52 40.5 Q57 36.5 62 39.5" fill="none" stroke="#18181B" strokeWidth="2.6" strokeLinecap="round" />
                    <circle cx="39" cy="46.5" r="3.6" fill={INK} />
                    <circle cx="57" cy="46.5" r="3.6" fill={INK} />
                    <circle cx="40.2" cy="45.2" r="1.3" fill="#FFFFFF" />
                    <circle cx="58.2" cy="45.2" r="1.3" fill="#FFFFFF" />
                    <path d="M43 60.5 Q49 61 54 58.5" fill="none" stroke="#FED7AA" strokeWidth="2.1" strokeLinecap="round" />
                </g>
            );
    }
}

export function PlayerAvatarArt({ avatarId, className }: PlayerAvatarArtProps) {
    const resolvedId = resolvePlayerAvatarId(avatarId);

    return (
        <svg
            viewBox="0 0 96 96"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {/* Sutil brilho decorativo no fundo para profundidade da coleção */}
            <circle cx="48" cy="44" r="34" fill="#FFFFFF" opacity="0.28" />
            <circle cx="20" cy="24" r="2.2" fill="#FFFFFF" opacity="0.6" />
            <circle cx="77" cy="22" r="1.8" fill="#FFFFFF" opacity="0.55" />
            {renderAvatarCharacter(resolvedId)}
        </svg>
    );
}
