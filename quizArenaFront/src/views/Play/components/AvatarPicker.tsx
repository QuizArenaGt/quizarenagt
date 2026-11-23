import type { CSSProperties } from 'react';
import Icon from '../../../components/ui/Icon/Icon';
import { PlayerAvatar } from '../../../components/ui/PlayerAvatar/PlayerAvatar';
import {
    PLAYER_AVATARS,
    type PlayerAvatarId,
    resolvePlayerAvatarId,
} from '../../../models/avatars';

interface AvatarPickerProps {
    selectedAvatarId: string;
    onSelect: (avatarId: PlayerAvatarId) => void;
    disabled?: boolean;
}

export default function AvatarPicker({
    selectedAvatarId,
    onSelect,
    disabled = false,
}: AvatarPickerProps) {
    const activeId = resolvePlayerAvatarId(selectedAvatarId);

    return (
        <div className="play-avatar-picker">
            <div className="play-avatar-picker__header">
                <span className="play-form__label" id="avatar-picker-label">
                    Escolha seu avatar
                </span>
            </div>

            <div
                className="play-avatar-picker__grid"
                role="radiogroup"
                aria-labelledby="avatar-picker-label"
            >
                {PLAYER_AVATARS.map((avatar) => {
                    const isSelected = avatar.id === activeId;
                    const tileStyle = {
                        '--avatar-ring': avatar.ringColor,
                    } as CSSProperties;

                    return (
                        <button
                            key={avatar.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={`${avatar.name}: ${avatar.description}`}
                            disabled={disabled}
                            style={tileStyle}
                            className={`play-avatar-picker__tile ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => onSelect(avatar.id)}
                        >
                            <PlayerAvatar
                                avatarId={avatar.id}
                                size="md"
                                decorative
                                selected={isSelected}
                            />
                            {isSelected && (
                                <span className="play-avatar-picker__check" aria-hidden="true">
                                    <Icon name="check" size={12} />
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
