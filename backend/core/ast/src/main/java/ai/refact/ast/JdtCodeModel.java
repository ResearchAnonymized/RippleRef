package ai.refact.ast;

import ai.refact.api.CodeModel;
import ai.refact.api.ast.*;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.dom.*;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Eclipse JDT-based implementation of CodeModel.
 * Provides AST parsing and analysis capabilities using Eclipse JDT.
 */
@Component
public class JdtCodeModel implements CodeModel {
    
    private static final Logger logger = LoggerFactory.getLogger(JdtCodeModel.class);
    
    private final List<CompilationUnit> compilationUnits = new ArrayList<>();
    private final ASTParser parser;
    
    public JdtCodeModel() {
        this.parser = ASTParser.newParser(AST.JLS21);
        configureParser();
    }
    
    private void configureParser() {
        // Configure parser for Java 21
        Map<String, String> options = JavaCore.getOptions();
        JavaCore.setComplianceOptions(JavaCore.VERSION_21, options);
        parser.setCompilerOptions(options);
        parser.setKind(ASTParser.K_COMPILATION_UNIT);
        parser.setResolveBindings(true);
        parser.setBindingsRecovery(true);
    }
    
    @Override
    public List<CompilationUnit> getCompilationUnits() {
        return compilationUnits;
    }
    
    @Override
    public void parseProject(Path projectRoot) throws IOException {
        logger.info("Parsing project at: {}", projectRoot);
        compilationUnits.clear();
        
        Files.walk(projectRoot)
                .filter(path -> path.toString().endsWith(".java"))
                .forEach(this::parseJavaFile);
        
        logger.info("Parsed {} Java files", compilationUnits.size());
    }
    
    private void parseJavaFile(Path filePath) {
        try {
            String source = Files.readString(filePath);
            parser.setSource(source.toCharArray());
            
            org.eclipse.jdt.core.dom.CompilationUnit jdtUnit = 
                    (org.eclipse.jdt.core.dom.CompilationUnit) parser.createAST(null);
            
            CompilationUnit unit = convertCompilationUnit(jdtUnit, filePath.toString());
            compilationUnits.add(unit);
            
            logger.debug("Parsed: {}", filePath);
            
        } catch (Exception e) {
            logger.warn("Failed to parse {}: {}", filePath, e.getMessage());
        }
    }
    
    private CompilationUnit convertCompilationUnit(org.eclipse.jdt.core.dom.CompilationUnit jdtUnit, String filePath) {
        List<ImportDeclaration> imports = new ArrayList<>();
        List<TypeDeclaration> types = new ArrayList<>();
        
        // Convert imports
        for (Object importObj : jdtUnit.imports()) {
            if (importObj instanceof org.eclipse.jdt.core.dom.ImportDeclaration) {
                org.eclipse.jdt.core.dom.ImportDeclaration jdtImport = 
                        (org.eclipse.jdt.core.dom.ImportDeclaration) importObj;
                imports.add(convertImportDeclaration(jdtImport));
            }
        }
        
        // Convert types
        for (Object typeObj : jdtUnit.types()) {
            if (typeObj instanceof org.eclipse.jdt.core.dom.TypeDeclaration) {
                org.eclipse.jdt.core.dom.TypeDeclaration jdtType = 
                        (org.eclipse.jdt.core.dom.TypeDeclaration) typeObj;
                types.add(convertTypeDeclaration(jdtType));
            }
        }
        
        return new CompilationUnit(
                filePath,
                imports,
                types,
                jdtUnit.getStartPosition(),
                jdtUnit.getLength()
        );
    }
    
    private ImportDeclaration convertImportDeclaration(org.eclipse.jdt.core.dom.ImportDeclaration jdtImport) {
        return new ImportDeclaration(
                jdtImport.getName().getFullyQualifiedName(),
                jdtImport.isStatic(),
                jdtImport.isOnDemand(),
                jdtImport.getStartPosition(),
                jdtImport.getLength()
        );
    }
    
    private TypeDeclaration convertTypeDeclaration(org.eclipse.jdt.core.dom.TypeDeclaration jdtType) {
        List<FieldDeclaration> fields = new ArrayList<>();
        List<MethodDeclaration> methods = new ArrayList<>();
        List<ConstructorDeclaration> constructors = new ArrayList<>();
        
        // Convert fields
        for (FieldDeclaration jdtField : jdtType.getFields()) {
            fields.add(convertFieldDeclaration(jdtField));
        }
        
        // Convert methods
        for (MethodDeclaration jdtMethod : jdtType.getMethods()) {
            methods.add(convertMethodDeclaration(jdtMethod));
        }
        
        // Convert constructors
        for (MethodDeclaration jdtConstructor : jdtType.getMethods()) {
            if (jdtConstructor.isConstructor()) {
                constructors.add(convertConstructorDeclaration(jdtConstructor));
            }
        }
        
        TypeKind kind = jdtType.isInterface() ? TypeKind.INTERFACE : 
                       jdtType.isEnum() ? TypeKind.ENUM : TypeKind.CLASS;
        
        return new TypeDeclaration(
                jdtType.getName().getIdentifier(),
                kind,
                convertModifiers(jdtType.modifiers()),
                fields,
                methods,
                constructors,
                jdtType.getStartPosition(),
                jdtType.getLength()
        );
    }
    
    private FieldDeclaration convertFieldDeclaration(FieldDeclaration jdtField) {
        List<VariableDeclarationFragment> fragments = new ArrayList<>();
        for (Object fragmentObj : jdtField.fragments()) {
            if (fragmentObj instanceof VariableDeclarationFragment) {
                VariableDeclarationFragment jdtFragment = (VariableDeclarationFragment) fragmentObj;
                fragments.add(new VariableDeclarationFragment(
                        jdtFragment.getName().getIdentifier(),
                        jdtFragment.getStartPosition(),
                        jdtFragment.getLength()
                ));
            }
        }
        
        return new FieldDeclaration(
                jdtField.getType().toString(),
                convertModifiers(jdtField.modifiers()),
                fragments,
                jdtField.getStartPosition(),
                jdtField.getLength()
        );
    }
    
    private MethodDeclaration convertMethodDeclaration(org.eclipse.jdt.core.dom.MethodDeclaration jdtMethod) {
        List<Parameter> parameters = new ArrayList<>();
        for (Object paramObj : jdtMethod.parameters()) {
            if (paramObj instanceof SingleVariableDeclaration) {
                SingleVariableDeclaration jdtParam = (SingleVariableDeclaration) paramObj;
                parameters.add(new Parameter(
                        jdtParam.getName().getIdentifier(),
                        jdtParam.getType().toString(),
                        jdtParam.getStartPosition(),
                        jdtParam.getLength()
                ));
            }
        }
        
        return new MethodDeclaration(
                jdtMethod.getName().getIdentifier(),
                jdtMethod.getReturnType2() != null ? jdtMethod.getReturnType2().toString() : "void",
                convertModifiers(jdtMethod.modifiers()),
                parameters,
                jdtMethod.getBody() != null ? jdtMethod.getBody().toString() : null,
                jdtMethod.getStartPosition(),
                jdtMethod.getLength()
        );
    }
    
    private ConstructorDeclaration convertConstructorDeclaration(org.eclipse.jdt.core.dom.MethodDeclaration jdtConstructor) {
        List<Parameter> parameters = new ArrayList<>();
        for (Object paramObj : jdtConstructor.parameters()) {
            if (paramObj instanceof SingleVariableDeclaration) {
                SingleVariableDeclaration jdtParam = (SingleVariableDeclaration) paramObj;
                parameters.add(new Parameter(
                        jdtParam.getName().getIdentifier(),
                        jdtParam.getType().toString(),
                        jdtParam.getStartPosition(),
                        jdtParam.getLength()
                ));
            }
        }
        
        return new ConstructorDeclaration(
                jdtConstructor.getName().getIdentifier(),
                convertModifiers(jdtConstructor.modifiers()),
                parameters,
                jdtConstructor.getBody() != null ? jdtConstructor.getBody().toString() : null,
                jdtConstructor.getStartPosition(),
                jdtConstructor.getLength()
        );
    }
    
    private List<Modifier> convertModifiers(List<?> jdtModifiers) {
        List<Modifier> modifiers = new ArrayList<>();
        for (Object modObj : jdtModifiers) {
            if (modObj instanceof org.eclipse.jdt.core.dom.Modifier) {
                org.eclipse.jdt.core.dom.Modifier jdtMod = (org.eclipse.jdt.core.dom.Modifier) modObj;
                modifiers.add(Modifier.valueOf(jdtMod.getKeyword().toString().toUpperCase()));
            }
        }
        return modifiers;
    }
    
    @Override
    public TypeDeclaration findClass(String className) {
        return compilationUnits.stream()
                .flatMap(unit -> unit.getTypes().stream())
                .filter(type -> type.getName().equals(className))
                .findFirst()
                .orElse(null);
    }
}
