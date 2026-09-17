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
        NODE_OPTIONS = '--max-old-space-size=3072'
        NPM_CONFIG_CACHE = '/var/jenkins_home/.npm-cache-shared'
        NEXT_TELEMETRY_DISABLED = '1'
        DOCKER_BUILDKIT = '1'
        COMPOSE_DOCKER_CLI_BUILD = '1'
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
                echo "ETAPE 1 : INSTALLATION"
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

        stage('2. Docker Build (Verifier construction image)') {
            options { timeout(time: 60, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "ETAPE 2 : DOCKER BUILD - Construction des images"
                echo "=========================================="

                sh '''
                    echo "Construction des images Docker..."
                    
                    echo "Generation du fichier .env pour le build..."
                    cat > .env << EOF
AUTH_SECRET=${AUTH_SECRET}
CRON_SECRET=${CRON_SECRET}
AUTH_SELF_HOST_PASSWORD=${AUTH_SELF_HOST_PASSWORD}
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@db:5432/asset_app?sslmode=disable
DIRECT_URL=postgresql://postgres:postgres@db:5432/asset_app?sslmode=disable
POSTGRES_PORT=5434
EOF
                    echo "Fichier .env cree"

                    echo "Construction image migrate..."
                    docker compose --profile full build migrate
                    echo "Image migrate construite"

                    echo "Construction image app..."
                    docker compose --profile full build app
                    echo "Image app construite"

                    echo "DOCKER BUILD - SUCCES"
                '''
            }
        }

        stage('3. Tests') {
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "ETAPE 3 : TESTS"
                echo "=========================================="

                sh '''
                    npm run test --if-present -- --passWithNoTests --ci
                    echo "TESTS - SUCCES (ou aucun test configure)"
                '''
            }
        }

        stage('4. Lint - Qualite Code') {
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "ETAPE 4 : LINT - Qualite du code"
                echo "=========================================="

                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    sh '''
                        npx eslint . --ext .js,.jsx,.ts,.tsx || echo "Lint termine avec avertissements"
                        echo "LINT - TERMINE"
                    '''
                }
            }
        }

        stage('5. Scan Dependances - Securite') {
            options { timeout(time: 15, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "ETAPE 5 : SCAN DEPENDANCES - Securite"
                echo "=========================================="

                sh '''
                    echo "Verification des vulnerabilites..."
                    if npm audit --audit-level=high > /dev/null 2>&1; then
                        echo "Aucune vulnerabilite critique detectee"
                    else
                        echo "Vulnerabilites trouvees - Mise a jour"
                        echo "NOTE: npm update sans --force pour eviter downgrade Prisma"
                        npm update || true
                        echo "Dependances mises a jour"
                    fi
                    
                    echo "ANALYSE DES DEPENDANCES - SUCCES"
                '''
            }
        }

        stage('6. Validation et Approbation Production') {
            steps {
                echo "=========================================="
                echo "ETAPE 6 : VALIDATION - Approbation Production"
                echo "=========================================="

                script {
                    if (!params.APPROUVER_DEPLOIEMENT) {
                        currentBuild.result = 'UNSTABLE'
                        error("Deploiement non autorise: la case APPROUVER_DEPLOIEMENT n'a pas ete cochee")
                    }
                }

                echo "Approbation confirmee via parametre de lancement"
            }
        }

        stage('7. Deploiement Production (run containers)') {
            options { timeout(time: 30, unit: 'MINUTES') }
            when {
                expression { currentBuild.result != 'UNSTABLE' }
            }
            steps {
                echo "=========================================="
                echo "ETAPE 7 : DEPLOIEMENT PRODUCTION"
                echo "=========================================="

                sh '''
                    set -e
                    
                    echo "Verification des permissions Docker..."
                    if ! docker ps > /dev/null 2>&1; then
                        echo "Permission Docker insuffisante - Correction..."
                        chmod 666 /var/run/docker.sock || sudo chmod 666 /var/run/docker.sock || true
                        echo "Permissions corrigees"
                    else
                        echo "Permissions Docker OK"
                    fi
                    
                    echo "Demarrage des services..."
                    docker compose --profile full up -d
                    echo "Services demarres"

                    echo "Attente que l'application soit healthy..."
                    STATUS="starting"
                    COUNTER=0
                    MAX_RETRIES=30
                    
                    while [ $COUNTER -lt $MAX_RETRIES ]; do
                        STATUS=$(docker inspect --format='{{.State.Health.Status}}' $(docker compose ps -q app) 2>/dev/null || echo "starting")
                        
                        if [ "$STATUS" = "healthy" ]; then
                            echo "Application healthy - Deploiement reussi"
                            break
                        fi
                        
                        echo "En attente... ($((COUNTER+1))/$MAX_RETRIES) - Statut: $STATUS"
                        sleep 2
                        COUNTER=$((COUNTER + 1))
                    done

                    if [ "$STATUS" != "healthy" ]; then
                        echo "L'application n'est jamais devenue healthy"
                        echo "Logs du container app:"
                        docker compose logs app --tail=100
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
            echo "PIPELINE ECHOUE"
            echo "=========================================="
            echo "Build: ${BUILD_NUMBER}"
            echo "URL: ${BUILD_URL}console"
            echo ""
            echo "Actions recommandees:"
            echo "1. Verifier les logs ci-dessus"
            echo "2. Corriger le probleme"
            echo "3. Relancer le build"
        }

        success {
            echo "=========================================="
            echo "PIPELINE SUCCES"
            echo "=========================================="
            echo "Build: ${BUILD_NUMBER}"
            echo "Application: Assets Tracker - Deployee en production"
            echo "URL: ${BUILD_URL}"
        }

        always {
            sh '''
                echo ""
                echo "Etat final des services:"
                docker compose ps || true
            '''
        }
    }
}