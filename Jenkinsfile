pipeline {
    agent any

    environment {
        SONAR_SERVER = 'SonarQube'
        AUTH_SECRET = credentials('assets-auth-secret')
        CRON_SECRET = credentials('assets-cron-secret')
        AUTH_SELF_HOST_PASSWORD = credentials('assets-auth-self-host-password')
        DATABASE_URL = credentials('assets-database-url') // Stored safely in Jenkins Credentials
    }

    tools {
        nodejs 'NodeJS-24'
    }

    options {
        timeout(time: 1, unit: 'HOURS') // Prevents jobs hanging forever at the approval stage
        ansiColor('xterm')
    }

    stages {
        stage('1. Build') {
            steps {
                checkout scm

                sh '''
                    set -e
                    corepack enable
                    corepack prepare pnpm@11.6.0 --activate
                    pnpm install --frozen-lockfile
                    pnpm build
                '''
            }
        }

        stage('2. Tests') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    sh 'pnpm test:unit'
                }
            }
        }

        stage('3. SonarQube') {
            steps {
                script {
                    def scannerHome = tool 'sonar-scanner'

                    withSonarQubeEnv("${SONAR_SERVER}") {
                        sh """
                            ${scannerHome}/bin/sonar-scanner \
                            -Dsonar.projectKey=assets-tracker \
                            -Dsonar.sources=src \
                            -Dsonar.exclusions=node_modules/**,.next/**,coverage/** \
                            -Dsonar.typescript.tsconfigPath=tsconfig.sonar.json
                        """
                    }
                }

                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('4. Dependency Scan') {
            steps {
                sh 'pnpm audit --audit-level=high'
            }
        }

        stage('5. Pre-production') {
            steps {
                echo 'Deploying to Pre-Production on port 8081...'
            }
        }

        stage('6. Validation & Approval') {
            steps {
                // Releases executor lock while waiting for human input
                input message: 'Approve deployment to Production?', ok: 'Approve'
            }
        }

        stage('7. Deployment') {
            steps {
                sh 'docker compose up -d'
            }
        }
    }

    post {
        failure {
            mail(
                to: 'bouraadaoumaima11@gmail.com',
                subject: "ALERT: Pipeline Failure - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """An error occurred in the pipeline.

Job: ${env.JOB_NAME}
Build: #${env.BUILD_NUMBER}

View Logs:
${env.BUILD_URL}console
"""
            )
        }

        success {
            echo "Pipeline executed successfully through to Production."
        }
    }
}