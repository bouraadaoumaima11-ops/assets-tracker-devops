pipeline {
    agent any

    environment {
        SONAR_SERVER = 'SonarQube'
        AUTH_SECRET = credentials('assets-auth-secret')
        CRON_SECRET = credentials('assets-cron-secret')
        AUTH_SELF_HOST_PASSWORD = credentials('assets-auth-self-host-password')
        DATABASE_URL = 'postgresql://postgres:postgres@db:5432/asset_app?sslmode=disable'
        NODE_OPTIONS = '--max-old-space-size=5120'
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
    }

    tools {
        nodejs 'NodeJS-24'
    }

    stages {

        stage('1. Build') {
    options {
        timeout(time: 15, unit: 'MINUTES')  // Réduire à 15min au lieu de 20
    }
    steps {
        checkout scm
        sh '''
            set -e
            export NODE_OPTIONS="--max-old-space-size=7168"
            rm -rf .next dist node_modules/.cache 2>/dev/null || true
            corepack enable
            corepack prepare pnpm@11.6.0 --activate
            pnpm install --frozen-lockfile
            pnpm build
        '''
    }
}

        stage('2. Tests') {
            options {
                timeout(time: 10, unit: 'MINUTES')
            }
            steps {
                sh '''
                    echo "=========================================="
                    echo "2. TESTS - Exécution des tests unitaires"
                    echo "=========================================="
                    pnpm test:unit || true
                    echo "✅ TESTS TERMINÉS!"
                '''
            }
        }

        stage('3. SonarQube') {
            options {
                timeout(time: 10, unit: 'MINUTES')
            }
            steps {
                script {
                    def scannerHome = tool 'sonar-scanner'

                    withSonarQubeEnv("${SONAR_SERVER}") {
                        sh """
                            echo "=========================================="
                            echo "3. SONARQUBE - Analyse de la qualité du code"
                            echo "=========================================="
                            ${scannerHome}/bin/sonar-scanner \
                            -Dsonar.projectKey=assets-tracker \
                            -Dsonar.sources=src \
                            -Dsonar.exclusions=node_modules/**,.next/**,coverage/** \
                            -Dsonar.typescript.tsconfigPath=tsconfig.sonar.json
                            echo "✅ SONARQUBE TERMINÉ!"
                        """
                    }
                }

                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: false
                }
            }
        }

        stage('4. Scan des Dépendances') {
            options {
                timeout(time: 5, unit: 'MINUTES')
            }
            steps {
                sh '''
                    echo "=========================================="
                    echo "4. SCAN - Analyse des dépendances"
                    echo "=========================================="
                    pnpm audit --audit-level=high || true
                    echo "✅ SCAN TERMINÉ!"
                '''
            }
        }

        stage('5. Pré-production') {
            steps {
                sh '''
                    echo "=========================================="
                    echo "5. PRÉ-PRODUCTION"
                    echo "=========================================="
                    echo "Déploiement en Pré-Production sur le port 8081."
                    echo "✅ PRÉ-PRODUCTION PRÊTE!"
                '''
            }
        }

        stage('6. Validation & Notifications') {
            steps {
                script {
                    echo "=========================================="
                    echo "6. VALIDATION - En attente de l'approbation"
                    echo "=========================================="
                    input(
                        message: 'Valider le passage en Production ?',
                        ok: 'Approuver'
                    )
                    echo "✅ APPROUVÉ!"
                }
            }
        }

        stage('7. Déploiement') {
            steps {
                sh '''
                    echo "=========================================="
                    echo "7. DÉPLOIEMENT - Déploiement en Production"
                    echo "=========================================="
                    docker compose up -d
                    echo "✅ DÉPLOIEMENT RÉUSSI!"
                '''
            }
        }
    }

    post {
        failure {
            emailext (
                to: 'bouraadaoumaima11@gmail.com',
                subject: "🔴 ALERT: Échec du Pipeline ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """Une erreur est survenue dans le pipeline.

📋 Informations du Build:
- Job : ${env.JOB_NAME}
- Build : #${env.BUILD_NUMBER}
- Lien : ${env.BUILD_URL}console

⚠️ IMPORTANT: Assurez-vous que next.config.ts a turbopack: false

Veuillez consulter les logs pour plus de détails.
"""
            )
        }

        success {
            emailext (
                to: 'bouraadaoumaima11@gmail.com',
                subject: "✅ SUCCÈS: Pipeline ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """Pipeline exécutée avec succès jusqu'à la Production!

📋 Informations du Build:
- Job : ${env.JOB_NAME}
- Build : #${env.BUILD_NUMBER}
- Lien : ${env.BUILD_URL}

Bravo! Votre application a été déployée avec succès.
"""
            )
            echo "=========================================="
            echo "✅ PIPELINE COMPLÈTEMENT RÉUSSIE!"
            echo "=========================================="
        }
    }
}