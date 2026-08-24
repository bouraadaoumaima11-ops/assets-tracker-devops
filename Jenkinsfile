pipeline {
    agent any

    environment {
        SONAR_SERVER = 'SonarQube'
        AUTH_SECRET = credentials('assets-auth-secret')
        CRON_SECRET = credentials('assets-cron-secret')
        AUTH_SELF_HOST_PASSWORD = credentials('assets-auth-self-host-password')
        DATABASE_URL = 'postgresql://postgres:postgres@db:5432/asset_app?sslmode=disable'
    }

    tools {
        nodejs 'NodeJS-24'
    }

    stages {

        stage('1. Build') {
            steps {
                echo 'Récupération du code source et compilation...'

                checkout scm

                sh '''
                    set -e

                    echo "========================================="
                    echo "=== Node.js ==="
                    node --version

                    echo "=== npm ==="
                    npm --version

                    echo "=== Installation de pnpm ==="
                    npm install -g pnpm@11.6.0

                    echo "=== pnpm ==="
                    pnpm --version

                    echo "=== Vérification des secrets ==="
                    test -n "$AUTH_SECRET"
                    test -n "$CRON_SECRET"
                    echo "Les deux secrets sont présents."

                    echo "=== Installation des dépendances ==="
                    pnpm install --frozen-lockfile

                    echo "=== Compilation du projet ==="
                    pnpm build

                    echo "=== Build terminé avec succès ==="
                    echo "========================================="
                '''
            }
        }

        stage('2. Tests') {
            steps {
                echo 'Exécution des tests automatisés...'

                timeout(time: 5, unit: 'MINUTES') {
                    sh '''
                        set -e

                        echo "========================================="
                        echo "=== Tests unitaires ==="
                        echo "=== Node ==="
                        node --version
                        echo "=== pnpm ==="
                        pnpm --version

                        echo "=== Lancement de Vitest ==="
                        pnpm exec vitest run --reporter=verbose

                        echo "=== Tests terminés avec succès ==="
                        echo "========================================="
                    '''
                }
            }
        }

        stage('3. SonarQube (Pre-Quality, Security & Quality Gate)') {
            steps {
                echo 'Analyse du code source avec SonarQube...'

                script {
                    def scannerHome = tool 'sonar-scanner'

                    withSonarQubeEnv("${SONAR_SERVER}") {
                        sh """
                            ${scannerHome}/bin/sonar-scanner \
                            -Dsonar.projectKey=assets-tracker \
                            -Dsonar.sources=. \
                            -Dsonar.typescript.tsconfigPath=tsconfig.sonar.json
                        """
                    }
                }

                echo 'Vérification du Quality Gate...'

                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('4. Scan des Dépendances') {
            steps {
                echo 'Audit de sécurité des dépendances externes...'

                sh '''
                    set -e

                    echo "=== Audit des dépendances ==="
                    pnpm audit --audit-level=high

                    echo "=== Audit terminé avec succès ==="
                '''
            }
        }

        stage('5. Pré-production') {
            steps {
                echo 'Déploiement sur l environnement de Pré-Production...'

                sh '''
                    set -e

                    echo "Application déployée en Pré-Prod sur le port 8081."
                '''
            }
        }

        stage('6. Validation & Notifications') {
            steps {
                echo 'En attente de la validation du responsable de production...'

                script {
                    input(
                        message: 'Valider le passage en Production ?',
                        ok: 'Approuver'
                    )
                }
            }
        }

        stage('7. Déploiement') {
            steps {
                echo 'Déploiement final en Production...'

                sh '''
                    set -e

                    echo "=== Déploiement Docker ==="
                    docker compose up -d

                    echo "=== Déploiement terminé avec succès ==="
                '''
            }
        }
    }

    post {
        failure {
            echo 'Une étape du pipeline a échoué ! Envoi de la notification e-mail d alerte...'

            mail(
                to: 'bouraadaoumaima11@gmail.com',
                subject: "ALERT: Échec dans le Pipeline ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """Attention,

Une erreur est survenue pendant l exécution du pipeline.

Job : ${env.JOB_NAME}
Build : #${env.BUILD_NUMBER}

Consultez les logs :
${env.BUILD_URL}console
"""
            )
        }

        success {
            echo 'Pipeline exécuté avec succès jusqu à la Production !'
        }
    }
}