/*
 * EN-TETE DE L'APPLICATION
 *
 * Contient, de gauche a droite :
 *   - une fleche de retour (uniquement sur les sous-ecrans) ;
 *   - le titre de l'ecran courant ;
 *   - l'indicateur de connexion ;
 *   - le bouton de verrouillage immediat ;
 *   - la bascule de theme.
 */

import { IndicateurConnexion } from './IndicateurConnexion.jsx';
import { useTheme } from '../contexte/ContexteTheme.jsx';

export function Entete({ titre, estUnSousEcran, surRetour, surVerrouillage }) {
  const { themeApplique, theme, definirTheme } = useTheme();

  // Un seul bouton fait tout le tour : auto -> clair -> sombre -> omni -> auto.
  const ORDRE_THEMES = ['auto', 'clair', 'sombre', 'omni'];
  const suivant = ORDRE_THEMES[(ORDRE_THEMES.indexOf(theme) + 1) % ORDRE_THEMES.length];
  const libelles = { auto: 'automatique', clair: 'clair', sombre: 'sombre', omni: 'Omni' };
  const icones = { auto: '🌗', clair: '☀️', sombre: '🌙', omni: '🌌' };

  return (
    <header className="entete">
      <div className="entete-interieur">
        {estUnSousEcran && (
          <button
            type="button"
            className="bouton-icone"
            onClick={surRetour}
            aria-label="Revenir à l’écran précédent"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}

        <h1 className="entete-titre">{titre}</h1>

        <div className="entete-actions">
          <IndicateurConnexion />

          <button
            type="button"
            className="bouton-icone"
            onClick={surVerrouillage}
            aria-label="Verrouiller l’application maintenant"
            title="Verrouiller"
          >
            <span aria-hidden="true">🔒</span>
          </button>

          <button
            type="button"
            className="bouton-icone"
            onClick={() => definirTheme(suivant)}
            aria-label={`Thème ${libelles[theme]} (actuellement ${themeApplique}). Passer en thème ${libelles[suivant]}.`}
            title={`Thème : ${libelles[theme]}`}
          >
            <span aria-hidden="true">{icones[theme]}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
