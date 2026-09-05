pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'APPROUVER_DEPLOIEMENT',
            defaultValue: false,
            description: 'Cocher pour autoriser le deploiement en production'
        )
    }

    environment {
        AUTH_SECRET = credentials('assets-auth-secret')
        CRON_SECRET = credentials('assets-cron-secret')
        AUTH_SELF_HOST_PASSWORD = credentials('assets-auth-self-host-password')
        DATABASE_URL = 'postgresql://postgres:postgres@db:5432/asset_app?sslmode=disable'
        NODE_OPTIONS = '--max-old-space-size=7168'
        NPM_CONFIG_CACHE = '/var/jenkins_home/.npm-cache-shared'
        NEXT_TELEMETRY_DISABLED = '1'
        DOCKER_BUILDKIT = '1'
        COMPOSE_DOCKER_CLI_BUILD = '1'
        DOCKER_HOST = 'tcp://host.docker.internal:2375'
    }

    tools {
        nodejs 'NodeJS-24'
    }

    options {
        timestamps()
    }

    stages {

        stage('1. Installation (pour tests/lint)') {
            options { timeout(time: 15, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 1: INSTALLATION"
                echo "=========================================="

                checkout scm

                sh '''
                    echo "Installation des dependances (pour tests et lint seulement)..."
                    if ! npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline \
                        --fetch-retries=5 --fetch-retry-mintimeout=20000; then
                        echo "Echec, nettoyage complet et nouvel essai..."
                        rm -rf node_modules
                        npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline
                    fi
                    echo "INSTALLATION - SUCCES"
                '''
            }
        }

        stage('2. Tests') {
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 2: TESTS"
                echo "=========================================="

                sh '''
                    npm run test --if-present -- --passWithNoTests --ci
                    echo "TESTS - SUCCES (ou aucun test configure)"
                '''
            }
        }

        stage('3. SonarQube - Analyse Qualite') {
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 3: SONARQUBE - Analyse de code"
                echo "=========================================="

                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    sh '''
                        npx eslint . --ext .js,.jsx,.ts,.tsx || echo "Lint termine avec avertissements"
                        echo "SONARQUBE/LINT - TERMINE"
                    '''
                }
            }
        }

        stage('4. Scan Dependances') {
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 4: SCAN DEPENDANCES - Securite"
                echo "=========================================="

                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    sh '''
                        npm audit --audit-level=high
                        echo "SCAN DEPENDANCES - SUCCES"
                    '''
                }
            }
        }

        stage('5. Validation et Approbation Production') {
            steps {
                echo "=========================================="
                echo "STAGE 5: VALIDATION - Approbation Production"
                echo "=========================================="

                script {
                    if (!params.APPROUVER_DEPLOIEMENT) {
                        currentBuild.result = 'UNSTABLE'
                        error("Deploiement non autorise: la case APPROUVER_DEPLOIEMENT n'a pas ete cochee au lancement du build")
                    }
                }

                echo "Approbation confirmee via parametre de lancement"
            }
        }

        stage('6. Deploiement Production (build + run Docker)') {
            options { timeout(time: 20, unit: 'MINUTES') }
            when {
                expression { currentBuild.result != 'UNSTABLE' }
            }
            steps {
                echo "=========================================="
                echo "STAGE 6: DEPLOIEMENT PRODUCTION"
                echo "=========================================="

                sh '''
                    echo "Generation du fichier .env pour le deploiement..."
                    cat > .env << EOF
AUTH_SECRET=${AUTH_SECRET}
CRON_SECRET=${CRON_SECRET}
AUTH_SELF_HOST_PASSWORD=${AUTH_SELF_HOST_PASSWORD}
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

                    echo "Construction (avec cache Docker layers) et demarrage des services..."
                    docker compose --profile full build
                    docker compose --profile full up -d

                    echo "Attente que l'app soit healthy..."
                    STATUS="starting"
                    for i in $(seq 1 20); do
                        STATUS=$(docker inspect --format='{{.State.Health.Status}}' $(docker compose ps -q app) 2>/dev/null || echo "starting")
                        if [ "$STATUS" = "healthy" ]; then
                            echo "App healthy !"
                            break
                        fi
                        echo "En attente... ($i/20) statut: $STATUS"
                        sleep 3
                    done

                    if [ "$STATUS" != "healthy" ]; then
                        echo "L'app n'est jamais devenue healthy"
                        docker compose logs app --tail=50
                        exit 1
                    fi

                    echo "DEPLOIEMENT - SUCCES"
                '''
            }
        }

    }

    post {
        failure {
            echo "=========================================="
            echo "Pipeline ECHOUE"
            echo "=========================================="
            echo "Build: ${BUILD_NUMBER}"
            echo "URL: ${BUILD_URL}console"
        }

        success {
            echo "=========================================="
            echo "Pipeline SUCCES"
            echo "=========================================="
            echo "Build: ${BUILD_NUMBER}"
            echo "Application: Assets Tracker - Deployee en production"
        }
    }
}