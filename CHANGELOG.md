# Barlog — Changelog

Format : MAJEUR.MINEUR.CORRECTIF (ex. 0.4.1)
- CORRECTIF : petite correction de bug
- MINEUR : nouvelle fonctionnalité
- MAJEUR : 1.0 = première version publique sur l'App Store

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
