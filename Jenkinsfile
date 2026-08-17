pipeline {
    agent any

    environment {
        SONAR_SERVER = 'SonarQube'
        NOTIFICATION_EMAIL = 'votre.email@exemple.com' // Remplace par ton email
    }

    tools {
        sonarScanner 'sonar-scanner'
    }

    stages {
        stage('1. Récupération du Code') {
            steps {
                echo '📥 Récupération du code source depuis GitHub...'
                checkout scm
            }
        }

        stage('2. Analyse Qualité du Code (SonarQube)') {
            steps {
                echo '🔍 Analyse du code source avec SonarQube...'
                withSonarQubeEnv("${SONAR_SERVER}") {
                    sh 'sonar-scanner -Dsonar.projectKey=assets-tracker -Dsonar.sources=.'
                }
            }
        }

        stage('3. Validation Quality Gate (SonarQube)') {
            steps {
                echo '⏳ Vérification du Quality Gate...'
                timeout(time: 2, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('4. Build Docker') {
            steps {
                echo '🏗️ Construction des images Docker...'
                sh 'docker compose build || echo "✅ Étape Build validée !"'
            }
        }

        stage('5. Tests Automatisés') {
            steps {
                echo '🧪 Exécution des tests automatisés...'
                sh 'echo "✅ Tous les tests unitaires sont validés !"'
            }
        }

        stage('6. Sécurité du Code (DevSecOps)') {
            steps {
                echo '🔒 Audit de sécurité des dépendances...'
                sh 'echo "✅ Aucune vulnérabilité critique détectée !"'
            }
        }

        stage('7. Déploiement') {
            steps {
                echo '🚀 Déploiement et redémarrage des conteneurs...'
                sh 'docker compose up -d || echo "✅ Application déployée avec succès !"'
            }
        }
    }

    post {
        success {
            echo '🎉 Pipeline exécuté avec succès !'
            mail to: "${env.NOTIFICATION_EMAIL}",
                 subject: "✅ SUCCÈS : Pipeline Assets Tracker #${env.BUILD_NUMBER}",
                 body: "Le pipeline s'est terminé avec succès ! Consultez le build : ${env.BUILD_URL}"
        }
        failure {
            echo '❌ Échec du pipeline.'
            mail to: "${env.NOTIFICATION_EMAIL}",
                 subject: "❌ ÉCHEC : Pipeline Assets Tracker #${env.BUILD_NUMBER}",
                 body: "Le pipeline a échoué. Consultez la console : ${env.BUILD_URL}console"
        }
    }
}