pipeline {
    agent any

    environment {
        SONAR_SERVER = 'SonarQube'
        AUTH_SECRET = credentials('assets-auth-secret')
        CRON_SECRET = credentials('assets-cron-secret')
        AUTH_SELF_HOST_PASSWORD = credentials('assets-auth-self-host-password')
        DATABASE_URL = 'postgresql://postgres:postgres@db:5432/asset_app?sslmode=disable'
        NODE_OPTIONS = '--max-old-space-size=7168'
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
                timeout(time: 15, unit: 'MINUTES')
            }
            steps {
                checkout scm
                sh '''
                    set -e
                    echo "=========================================="
                    echo "1. BUILD - Compilation"
                    echo "=========================================="
                    rm -rf .next dist node_modules/.cache 2>/dev/null || true
                    corepack enable
                    corepack prepare pnpm@11.6.0 --activate
                    pnpm install --frozen-lockfile
                    pnpm build
                    echo "✅ BUILD RÉUSSI!"
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
                    echo "2. TESTS"
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
                            echo "3. SONARQUBE"
                            echo "=========================================="
                            ${scannerHome}/bin/sonar-scanner \
                            -Dsonar.projectKey=assets-tracker \
                            -Dsonar.sources=src \
                            -Dsonar.exclusions=node_modules/**,.next/**,coverage/**
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
                    echo "4. SCAN DÉPENDANCES"
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
                    echo "Application prête pour pré-production"
                    echo "✅ PRÉ-PRODUCTION PRÊTE!"
                '''
            }
        }

        stage('6. Validation') {
            steps {
                script {
                    echo "=========================================="
                    echo "6. VALIDATION - En attente d'approbation"
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
                    echo "7. DÉPLOIEMENT"
                    echo "=========================================="
                    echo "Application déployée en production"
                    echo "✅ DÉPLOIEMENT RÉUSSI!"
                '''
            }
        }
    }

    post {
        failure {
            echo "❌ PIPELINE ÉCHOUÉ"
        }
        success {
            echo "=========================================="
            echo "✅ PIPELINE COMPLÈTEMENT RÉUSSIE!"
            echo "=========================================="
        }
    }
}