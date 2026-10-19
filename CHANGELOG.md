# Barlog — Changelog

Format : MAJEUR.MINEUR.CORRECTIF (ex. 0.4.1)
- CORRECTIF : petite correction de bug
- MINEUR : nouvelle fonctionnalité
- MAJEUR : 1.0 = première version publique sur l'App Store

## 0.23.0 — 2026-10-19
- Partage (bêta) : publier une séance depuis « Séance enregistrée » ou le détail d’une séance, avec visibilité et petit mot ; retirer une publication ; option de publication automatique ; marque sur les séances publiées. Erreurs du compte affichées sous les boutons.

## 0.22.0 — 2026-10-19
- Compte Barlog (bêta, optionnel) dans le Profil : connexion par code e-mail, pseudo, profil privé/public, visibilité par défaut, déconnexion, suppression du compte. Prépare le partage de séances.

## 0.21.0 — 2026-10-19
- Le widget écran d’accueil (Android) devient une fonction Barlog Pro. Sans Pro, il propose de débloquer et ouvre la page Pro.
- Page Pro : « Bientôt : sync iCloud » retiré ; sur Android, le widget apparaît dans la liste des avantages.

## 0.20.1 — 2026-10-18
- Profil : lien « Politique de confidentialité » en bas de page (exigé par Apple et Google).

## 0.20.0 — 2026-10-18
- Android : widgets d’écran d’accueil. Petit : prochaine séance et série de semaines. Moyen : prochaine séance, ses exercices et les jours de la semaine. Toucher le widget ouvre Barlog.

## 0.19.1 — 2026-10-18
- Santé / Health Connect : la séance est enregistrée avec son nom (ex. « Push A »).

## 0.19.0 — 2026-10-18
- Android : Samsung Health via Health Connect. Séances envoyées (avec calories et distance pour le cardio), poids récupéré, et en Pro : masse grasse, masse maigre et IMC (calculé avec ta taille). Supprimer une séance dans Barlog la supprime aussi de Health Connect.

## 0.18.3 — 2026-10-18
- Polices intégrées à l’app : plus aucun appel à Google Fonts, et l’affichage est correct même hors connexion dès le premier lancement.
- Nouvelle page Politique de confidentialité (privacy.html, FR/EN).

## 0.18.2 — 2026-10-18
- Android : l’autorisation « Alarmes et rappels » est demandée une seule fois, à l’activation de la notification de fin de repos (avant, l’écran de réglages s’ouvrait à chaque repos).
- Android : le minuteur de l’écran verrouillé affiche le bon temps restant (il comptait depuis le début du repos).
- Android : textes adaptés (sauvegarde vers Google Drive, mode silencieux).

## 0.18.1 — 2026-10-18
- Notification de fin de repos : correction, elle arrivait parfois en avance ou en retard quand on modifiait le repos (plusieurs programmations se chevauchaient).
- Android : le minuteur s’affiche maintenant sur l’écran verrouillé et dans la Now Bar (Live Update Android 16).

## 0.18.0 — 2026-10-18
- Version Android : le bouton / geste retour ferme la fenêtre ouverte ou revient à l’écran précédent (sans jamais abandonner la séance en cours), puis met l’app en arrière-plan.
- Android : Apple Health et ses mentions sont masqués.
- Android : minuteur de repos sur l’écran verrouillé, via une notification avec chrono.

## 0.17.0 — 2026-10-18
- Pro : nouvelle couleur d’accent Rouge (7 couleurs au choix).

## 0.16.0 — 2026-10-18
- Progrès → Corps : graphique refait. Axe Y gradué avec les valeurs et lignes de repère, axe X avec 4 dates, points placés selon la vraie date.
- Un seul graphique, choix de la donnée à afficher : poids, masse grasse, masse maigre, IMC, tour de taille, hanches, poitrine, bras, cuisse (seulement celles qui ont des mesures).

## 0.15.2 — 2026-10-18
- Mensurations : « Taille » devient « Tour de taille » pour éviter la confusion avec la hauteur.

## 0.15.1 — 2026-10-18
- Santé : correction, la composition (masse grasse, IMC…) est relue sur tout l’historique après avoir donné l’autorisation. Réactiver Apple Health relance une lecture complète.

## 0.15.0 — 2026-10-18
- Apple Health devient gratuit : séances envoyées dans Santé et poids récupéré.
- Pro : masse grasse, masse maigre et IMC (et tour de taille) récupérés depuis Santé. Nouvelle section « Composition » dans Progrès → Corps, avec l’évolution depuis la mesure précédente.

## 0.14.0 — 2026-10-18
- Apple Health : Barlog lit tes pesées depuis Santé (Withings, balance connectée, autre app) à l’ouverture et à chaque retour dans l’app. Une pesée par jour, tes saisies manuelles ne sont jamais écrasées, celles de Barlog ne sont pas relues.

## 0.13.4 — 2026-10-18
- Apple Health : supprimer une séance dans Barlog la supprime aussi de Santé (entraînement, calories et distance).

## 0.13.3 — 2026-10-18
- Apple Health : correction, le plugin Santé est maintenant trouvé dans l’app iPhone.

## 0.13.2 — 2026-10-18
- Apple Health : messages clairs à chaque étape de la connexion (diagnostic quand rien ne se passe).

## 0.13.1 — 2026-10-18
- Exercices chronométrés (planche, GHD hold…) : le compte à rebours du maintien s’affiche aussi sur l’écran verrouillé, avec le côté (gauche / droite) pour les exercices par côté.

## 0.13.0 — 2026-10-18
- Cardio : chronomètre intégré à la série (lancer / arrêter / reprendre), les minutes se remplissent seules. Sur l’écran verrouillé : chrono qui monte, avec barre vers l’objectif.
- RPE / RIR (option, désactivé par défaut) : Profil → Entraînement → Effort par série. Petite rangée de choix sous la série active, affiché dans l’historique.
- Apple Health (Pro, app native) : séances (musculation ou type de cardio, durée, kcal estimées, distance) et pesées envoyées dans Santé. Profil → Notifications et Santé.

## 0.12.1 — 2026-10-18
- Profil : la carte Barlog Pro n’est plus écrasée.
- Chronomètre écran verrouillé : message d’erreur clair s’il ne peut pas démarrer (pour diagnostiquer).

## 0.12.0 — 2026-10-18
- Barlog Pro (mode test, sans paiement réel) : écran d’offres (mensuel 2,99 €, annuel 19,99 € avec 7 jours d’essai, à vie 49,99 €) et carte Pro en haut du Profil.
- Réservé à Pro : onglet Stats, moyenne 4 semaines de la body map, muscle → exercices, muscles cliquables dans l’historique, programmes Force 5×5 et Haut / Bas, couleurs d’accent. Marqués ✦.
- Tout le reste reste gratuit (séances, routines, historique, minuteur, records, import, export).

## 0.11.0 — 2026-10-17
- App native : minuteur de repos en direct sur l’écran verrouillé et dans la Dynamic Island (Live Activity), avec l’exercice suivant. Réglage dans Profil → Notifications. Nécessite les fichiers Swift du dossier ios-native.

## 0.10.1 — 2026-10-17
- App native : données enregistrées dans un fichier natif sécurisé (plus de risque d’effacement par iOS), inclus dans la sauvegarde iCloud de l’iPhone. Copie de secours de la session précédente. Migration automatique depuis l’ancien stockage.
- App native : la bulle « Installer via Safari » n’apparaît plus.

## 0.10.0 — 2026-10-17
- Accueil (1re ouverture) : objectif, niveau, séances/semaine, unités → programme recommandé, en 30 secondes. Option « J’ai déjà un historique » ou « Explorer avec des données d’exemple ».
- Import Strong / Hevy (CSV) : Profil → Tes données. Séances, séries, échauffements et durée ajoutés à l’historique, noms d’exercices reconnus automatiquement, doublons ignorés.
- Record battu en direct : carte « Nouveau record » animée, son et vibration au moment de valider la série.
- Cardio : nouveau type d’exercice (minutes, distance, kcal) + 7 exercices cardio dans la bibliothèque. Pas de minuteur de repos après le cardio.
- Notifications (Profil) : fin de repos écran verrouillé et rappels les jours d’entraînement. Complet dans la future app native ; en web, fin de repos sur Android seulement.

## 0.9.3 — 2026-10-17
- Historique : touche un muscle (sur le corps ou dans les puces) pour le surligner et voir quels exercices de la séance l’ont travaillé, avec le nombre de séries.

## 0.9.2 — 2026-10-17
- Historique : chaque séance terminée affiche maintenant la carte du corps avec les muscles travaillés et les séries par muscle.

## 0.9.1 — 2026-10-17
- Mises à jour : l’app compare maintenant son numéro de version à celui en ligne et se recharge toute seule. Le service worker contourne le cache GitHub (≈10 min) pour récupérer la dernière version.

## 0.9.0 — 2026-10-17
- Muscle → exercices : touche un muscle (carte agrandie) pour voir tous les exercices de la bibliothèque qui le ciblent (principal / secondaire), et les ajouter à la séance en cours ou lancer une séance en un geste.
- Bilan de séance : carte du corps avec les muscles travaillés, séries par muscle, et bouton « Partager » qui génère une image (stories, messages).

## 0.8.0 — 2026-10-16
- Carte musculaire redessinée : fibres musculaires dans le sens anatomique réel, ombrage en relief, cou, adducteurs, tibial, coiffe et tendon d’Achille.
- Nouveau mode « Agrandir la carte » : grand corps plein écran, bascule Face / Dos, sélection par puces (bascule auto sur la bonne face), affichage de tes exercices qui ciblent le muscle.

## 0.7.2 — 2026-10-16
- Séance : la note de séance n'est plus écrasée/chevauchée par « Abandonner la séance » et reste accessible.

## 0.7.1 — 2026-10-15
- Barre d'onglets du bas : les 4 onglets sont maintenant espacés à distance égale.

## 0.7.0 — 2026-10-15
- Nouvelle carte du corps (Progrès → Stats et fiche exercice) : vraie silhouette avec muscles détaillés, 4 niveaux d'intensité, halo sur les muscles les plus travaillés.
- Stats : toucher un muscle (ou une ligne) affiche séries, % du volume et rang ; les autres muscles s'estompent.
- Fiche exercice : principal en plein + halo, secondaire en pointillé ; on peut toucher le corps pour régler les muscles.
- Profil → Couleur d'accent : Lime, Orange, Rose, Violet, Cyan, Or (appliquée partout).

## 0.6.1 — 2026-10-15
- Carte du corps redessinée : vraie silhouette avant/arrière, muscles découpés (pectoraux, abdos en blocs, dorsaux, fessiers, ischios…).
- Contraste plus fort : muscles non travaillés en gris, échelle en 5 niveaux (0, 1–4, 5–9, 10–14, 15+ séries).
- Liste triée du plus au moins travaillé, avec barres ; muscles non travaillés listés à part.
- Fiche d'exercice : même nouvelle silhouette (principal en lime, secondaire en vert olive).

## 0.6.0 — 2026-10-15
- Bibliothèque d'exercices (Programmes → Bibliothèque) : fiche par exercice avec muscles travaillés, carte du corps, tes stats, note.
- Photo ou vidéo par exercice (depuis ta pellicule, stockée sur le téléphone) + bouton « Voir une démo » (recherche YouTube).
- Muscles principaux / secondaires détectés automatiquement et modifiables.
- Carte du corps dans Progrès → Stats : séries par muscle sur 7 jours ou moyenne 4 semaines.
- Accès à la fiche depuis l'éditeur de routine (toucher le nom), l'ajout d'exercice et le menu ⋯ en séance.

## 0.5.5 — 2026-10-15
- Corps : choix de la période du graphique de poids (7 j, 1 mois, 3 mois, 1 an, Tout). L'écart affiché est calculé sur la période choisie.

## 0.5.4 — 2026-10-15
- Corps : import de pesées depuis un fichier CSV (Withings weight.csv ou tout CSV date + poids). Détection auto kg/lb, séparateur , ou ;, une pesée par jour (la plus récente), mensurations existantes conservées.

## 0.5.3 — 2026-10-15
- Corps : choix de l'unité du poids (kg / lb) et des mensurations (cm / in / pieds), indépendant de l'unité des charges. En pieds, saisie au format 2'10 (pieds'pouces). Les données existantes sont converties automatiquement.

## 0.5.2 — 2026-10-15
- Menu ⋯ ajouté dans l'éditeur de routine (Programmes → Modifier) : type Reps/Durée, Par côté, calculateur de disques, superset et note — réglables avant de lancer la séance.

## 0.5.1 — 2026-10-15
- Un exercice peut combiner Durée + Par côté (ex. GHD Hold 20 s par côté) : colonnes L s / R s, minuteur gauche puis droite automatiquement.
- Menu ⋯ : le type devient « Reps / Durée » + un interrupteur « Par côté » séparé.

## 0.5.0 — 2026-10-15
- Exercices unilatéraux : saisie gauche / droite (détection auto des « per side »).
- Exercices chronométrés : minuteur intégré par série (détection auto des « (sec) », plank, hold).
- Supersets : lier des exercices dans l'éditeur de routine ou pendant la séance ; pas de repos entre exercices liés.
- Calculateur de disques pour les exercices à la barre + réglage barre légère.
- Notes par exercice (gardées d'une séance à l'autre) + note de séance.
- 4 programmes prêts à l'emploi (Full Body, Force 5×5, Haut/Bas, Push/Pull/Legs).
- Suivi du corps : poids corporel (graphique) + mensurations, dans Progrès → Corps.

## 0.4.0 — 2026-10-15
- Application bilingue français / anglais (Profil → Langue). Détection automatique selon la langue du téléphone.
- Rappel de sauvegarde après 14 jours + export vers Fichiers / iCloud Drive.
- Correctif : sauvegarde automatique des données plus fiable.

## 0.3.0 — 2026-10-15
- Progress → Lifts : recherche, filtre par séance, période (4 sem / 3 mois / tout), axe, tendance lissée, détails au toucher, records par reps, alerte de stagnation.
- Nouvel onglet Stats : régularité, séries par muscle, tendance par exercice.
- Séance proposée selon le jour de la semaine + alerte si lancée un autre jour.
- Mises à jour automatiques sans réinstaller l'app.

## 0.2.0
- Modification des séances passées, calendrier, résumé de séance, échauffements, propositions de charge.

## 0.1.0
- Première version : enregistrement rapide, routines, minuteur de repos, historique hors ligne.
