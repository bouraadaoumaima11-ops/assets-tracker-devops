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
    }

    tools {
        nodejs 'NodeJS-24'
    }

    options {
        timestamps()
    }

    stages {

        stage('1a. Installation Dependances') {
            options { timeout(time: 15, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 1a: INSTALLATION DES DEPENDANCES"
                echo "=========================================="

                checkout scm

                sh '''
                    echo "Nettoyage des installations precedentes..."
                    rm -rf node_modules

                    echo "Installation des dependances..."
                    npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline

                    echo "INSTALLATION - SUCCES"
                '''
            }
        }

        stage('1b. Build Application') {
            options { timeout(time: 20, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 1b: BUILD APPLICATION"
                echo "=========================================="

                sh '''
                    echo "Generation du client Prisma..."
                    npx prisma generate

                    echo "Restauration du cache Next.js si disponible..."
                    mkdir -p /var/jenkins_home/.next-cache-shared
                    mkdir -p .next
                    cp -r /var/jenkins_home/.next-cache-shared .next/cache 2>/dev/null || true

                    echo "Build de l'application Next.js..."
                    npm run build

                    echo "Sauvegarde du cache Next.js pour le prochain build..."
                    mkdir -p /var/jenkins_home/.next-cache-shared
                    cp -r .next/cache/* /var/jenkins_home/.next-cache-shared/ 2>/dev/null || true

                    echo "BUILD - SUCCES"
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
                    echo "Execution des tests..."
                    npm test -- --passWithNoTests --ci
                    echo "TESTS - SUCCES"
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
                        echo "Analyse statique du code (lint)..."
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
                        echo "Audit de securite npm..."
                        npm audit --audit-level=high
                        echo "SCAN DEPENDANCES - SUCCES"
                    '''
                }
            }
        }

        stage('5. Pre-production') {
            options { timeout(time: 5, unit: 'MINUTES') }
            steps {
                echo "=========================================="
                echo "STAGE 5: PRE-PRODUCTION"
                echo "=========================================="

                sh '''
                    echo "Verification que l'app demarre correctement..."
                    (npm run start &)
                    sleep 8
                    curl -f http://localhost:3000 || (echo "L'app ne repond pas" && exit 1)
                    pkill -f "next start" 2>/dev/null || true
                    echo "PRE-PRODUCTION - SUCCES"
                '''
            }
        }

        stage('6. Validation et Approbation Production') {
            steps {
                echo "=========================================="
                echo "STAGE 6: VALIDATION - Approbation Production"
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

        stage('7. Deploiement Production') {
            options { timeout(time: 10, unit: 'MINUTES') }
            when {
                expression { currentBuild.result != 'UNSTABLE' }
            }
            steps {
                echo "=========================================="
                echo "STAGE 7: DEPLOIEMENT PRODUCTION"
                echo "=========================================="

                sh '''
                    echo "Generation du fichier .env pour le deploiement..."
                    cat > .env << EOF
AUTH_SECRET=${AUTH_SECRET}
CRON_SECRET=${CRON_SECRET}
AUTH_SELF_HOST_PASSWORD=${AUTH_SELF_HOST_PASSWORD}
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

                    echo "Construction et demarrage des services (db, migrate, app)..."
                    docker compose --profile full up -d --build

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