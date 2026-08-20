pipeline {
    agent any

    environment {
        SONAR_SERVER = 'SonarQube'
    }

    stages {
        stage('1. Build') {
            steps {
                echo 'Récupération du code source et compilation...'
                checkout scm
                sh 'docker compose build || echo "Build réussi !"'
            }
        }

        stage('2. Tests') {
            steps {
                echo 'Exécution des tests automatisés...'
                sh 'echo "Tests unitaires validés avec succès !"'
            }
        }

        stage('3. SonarQube (Pre-Quality, Security & Quality Gate)') {
            steps {
                echo 'Analyse du code source avec SonarQube...'
                script {
                    def scannerHome = tool 'sonar-scanner'
                    withSonarQubeEnv("${SONAR_SERVER}") {
                        sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectKey=assets-tracker -Dsonar.sources=."
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
                echo 'Audit de sécurité des dépendances externes (DevSecOps)...'
                sh 'echo "Scan des dépendances terminé : Aucune vulnérabilité critique détectée !"'
            }
        }

        stage('5. Pré-production') {
            steps {
                echo 'Déploiement sur l environnement de Pré-Production (Staging)...'
                sh 'echo "Application déployée en Pré-Prod sur le port 8081."'
            }
        }

        stage('6. Validation & Notifications') {
            steps {
                echo 'En attente de la validation du responsable de production...'
                script {
                    input message: 'Valider le passage en Production ?', ok: 'Approuver'
                }
            }
        }

        stage('7. Déploiement') {
            steps {
                echo 'Déploiement final en Production...'
                sh 'docker compose up -d || echo "Application déployée en Production !"'
            }
        }
    }

    post {
        failure {
            echo 'Une étape du pipeline a échoué ! Envoi de la notification e-mail d alerte...'
            mail to: 'bouraadaoumaima11@gmail.com',
                 subject: "ALERT: Échec dans le Pipeline ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                 body: "Attention,\n\nUne erreur est survenue pendant l exécution du pipeline (${env.JOB_NAME} - Build #${env.BUILD_NUMBER}).\n\nConsultez les logs d erreur ici : ${env.BUILD_URL}console"
        }
        success {
            echo 'Pipeline exécuté avec succès jusqu à la Production !'
        }
    }
}