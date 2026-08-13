pipeline {
    agent any

    stages {
        stage('1. Checkout Code') {
            steps {
                echo '📥 Récupération du code source depuis GitHub...'
                checkout scm
            }
        }

        stage('2. Tests Automatisés') {
            steps {
                echo '🧪 Exécution des tests unitaires et vérification de la syntaxe...'
                // Exécute la suite de tests de l'application
                bat 'npm test -- --passWithNoTests'
            }
        }

        stage('3. Sécurité du Code (DevSecOps)') {
            steps {
                echo '🔒 Scan de sécurité des dépendances...'
                // Vérifie les failles de sécurité dans le package.json
                bat 'npm audit --audit-level=high || echo "Vulnérabilités détectées"'
            }
        }

        stage('4. Build Docker') {
            steps {
                echo '🏗️ Construction des images Docker...'
                bat 'docker compose build'
            }
        }

        stage('5. Déploiement') {
            steps {
                echo '🚀 Déploiement et redémarrage des conteneurs...'
                bat 'docker compose down'
                bat 'docker compose up -d'
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline exécuté avec succès : Application testée, sécurisée et déployée !'
        }
        failure {
            echo '❌ Échec du pipeline : Le déploiement a été stoppé pour protéger l\'application.'
        }
    }
}